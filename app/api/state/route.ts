import { getChatGPTUser } from "../../chatgpt-auth";
import { resolveWorkspace, stateId } from "../../state-store";
import { getDb } from "../../../db";
import { appState, suppliers, products, prs, prItems, quotes, pos, poItems, poAllocations, poDocs, poPayments, purchaseHistory, trashItems } from "../../../db/schema";
import { eq } from "drizzle-orm";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Không có quyền truy cập" }, { status: 401 });

  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const drizzleDb = getDb();

  let data: any = null;
  let updatedAt: any = null;
  let version = 0;

  const row = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
  if (!row) {
    const fallback = await drizzleDb.select().from(appState).where(eq(appState.id, "procurement")).get();
    if (fallback) {
      data = JSON.parse(fallback.payload);
      updatedAt = fallback.updatedAt;
      version = fallback.version;
    }
  } else {
    data = JSON.parse(row.payload);
    updatedAt = row.updatedAt;
    version = row.version;
  }

  if (!data) {
    return Response.json({ data: null, updatedAt: null, version: 0, workspaceId });
  }

  // RECOVERY MIGRATION: If app_state is missing `prs` (due to diff bug), load from legacy tables
  if (!data.prs || data.prs.length === 0) {
    try {
      const [dbSuppliers, dbProducts, dbPrs, dbPrItems, dbPos, dbPoItems, dbPoAllocations, dbPoDocs, dbPoPayments, dbQuotes, dbHistory, dbTrash] = await Promise.all([
          drizzleDb.select().from(suppliers).where(eq(suppliers.workspaceId, workspaceId)),
          drizzleDb.select().from(products).where(eq(products.workspaceId, workspaceId)),
          drizzleDb.select().from(prs).where(eq(prs.workspaceId, workspaceId)),
          drizzleDb.select().from(prItems),  
          drizzleDb.select().from(pos).where(eq(pos.workspaceId, workspaceId)),
          drizzleDb.select().from(poItems),
          drizzleDb.select().from(poAllocations),
          drizzleDb.select().from(poDocs),
          drizzleDb.select().from(poPayments),
          drizzleDb.select().from(quotes),
          drizzleDb.select().from(purchaseHistory).where(eq(purchaseHistory.workspaceId, workspaceId)),
          drizzleDb.select().from(trashItems).where(eq(trashItems.workspaceId, workspaceId))
      ]);
  
      if (dbPrs.length > 0) {
          const prIds = new Set(dbPrs.map(pr => pr.id));
          const poIds = new Set(dbPos.map(po => po.id));
  
          const filteredPrItems = dbPrItems.filter(i => prIds.has(i.prId));
          const filteredPoItems = dbPoItems.filter(i => poIds.has(i.poId));
          const poItemIds = new Set(filteredPoItems.map(i => i.id));
          
          const filteredPoAllocations = dbPoAllocations.filter(a => poItemIds.has(a.poItemId));
          const filteredPoDocs = dbPoDocs.filter(d => poIds.has(d.poId));
          const filteredPoPayments = dbPoPayments.filter(p => poIds.has(p.poId));
          const filteredQuotes = dbQuotes.filter(q => prIds.has(q.prId));
  
          data.prs = dbPrs.map(pr => ({
              ...pr,
              items: filteredPrItems.filter(i => i.prId === pr.id).map(i => ({ ...i, id: i.originalId }))
          }));
          data.pos = dbPos.map(po => ({
              ...po,
              items: filteredPoItems.filter(i => i.poId === po.id).map(i => ({
                  ...i,
                  id: i.originalId,
                  allocations: filteredPoAllocations.filter(a => a.poItemId === i.id)
              })),
              docs: filteredPoDocs.filter(d => d.poId === po.id),
              payments: filteredPoPayments.filter(p => p.poId === po.id)
          }));
          
          if (!data.quotes) data.quotes = {};
          filteredQuotes.forEach(q => {
              if (!data.quotes[q.prId]) data.quotes[q.prId] = {};
              data.quotes[q.prId][q.supplierId] = { price: q.price, note: q.note, priceMode: q.priceMode, vatRate: q.vatRate };
          });
          
          if (!data.suppliers || data.suppliers.length === 0) data.suppliers = dbSuppliers;
          if (!data.products || data.products.length === 0) data.products = dbProducts;
          if (!data.purchaseHistory || data.purchaseHistory.length === 0) data.purchaseHistory = dbHistory;
          if (!data.trash || data.trash.length === 0) data.trash = dbTrash.map(t => ({ ...t, data: t.data ? JSON.parse(t.data) : null }));
      }
    } catch (e) {
      console.error("Lỗi phục hồi dữ liệu PR cũ:", e);
    }
  }

  return Response.json({ data, updatedAt, version, workspaceId });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Khng c quy?n truy c?p" }, { status: 401 });

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return Response.json({ error: "JSON kh�ng h?p l?" }, { status: 400 });
  }

  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const drizzleDb = getDb();
  
  const now = new Date().toISOString();
  
  try {
    const existing = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
    let merged = data;
    if (existing) {
      try {
        const existingData = JSON.parse(existing.payload);
        merged = { ...existingData, ...data };
      } catch (e) {
        // Fallback if existing data is corrupt
      }
    }
    const payloadStr = JSON.stringify(merged);
    
    if (existing) {
      await drizzleDb.update(appState).set({ payload: payloadStr, updatedAt: now, version: existing.version + 1 }).where(eq(appState.id, stateId(workspaceId)));
    } else {
      await drizzleDb.insert(appState).values({ id: stateId(workspaceId), payload: payloadStr, updatedAt: now, version: 1 });
    }
    return Response.json({ ok: true, updatedAt: now });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}