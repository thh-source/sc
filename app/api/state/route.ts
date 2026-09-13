import { getChatGPTUser } from "../../chatgpt-auth";
import { resolveWorkspace, stateId } from "../../state-store";
import { getDb } from "../../../db";
import {
  suppliers, products, prs, prItems, pos, poItems, poAllocations, poDocs, poPayments, quotes, purchaseHistory, trashItems, auditLogs, appState
} from "../../../db/schema";
import { eq, inArray, sql } from "drizzle-orm";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Không có quyền truy cập" }, { status: 401 });

  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const drizzleDb = getDb();

  // For the transitional phase, we can STILL fallback to app_state if the new tables are empty
  const [dbSuppliers, dbProducts, dbPrs] = await Promise.all([
    drizzleDb.select().from(suppliers).where(eq(suppliers.workspaceId, workspaceId)),
    drizzleDb.select().from(products).where(eq(products.workspaceId, workspaceId)),
    drizzleDb.select().from(prs).where(eq(prs.workspaceId, workspaceId))
  ]);

  if (dbSuppliers.length === 0 && dbPrs.length === 0 && dbProducts.length === 0) {
    // Fallback to legacy JSON blob if SQL migration hasn't run yet
    const row = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
    if (!row) return Response.json({ data: null, updatedAt: null, version: 0, workspaceId });
    return Response.json({ data: JSON.parse(row.payload), updatedAt: row.updatedAt, version: row.version, workspaceId });
  }

  const [dbPrItems, dbPos, dbPoItems, dbPoAllocations, dbPoDocs, dbPoPayments, dbQuotes, dbHistory, dbTrash] = await Promise.all([
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

  const prIds = new Set(dbPrs.map(pr => pr.id));
  const poIds = new Set(dbPos.map(po => po.id));

  const filteredPrItems = dbPrItems.filter(i => prIds.has(i.prId));
  const filteredPoItems = dbPoItems.filter(i => poIds.has(i.poId));
  const poItemIds = new Set(filteredPoItems.map(i => i.id));
  
  const filteredPoAllocations = dbPoAllocations.filter(a => poItemIds.has(a.poItemId));
  const filteredPoDocs = dbPoDocs.filter(d => poIds.has(d.poId));
  const filteredPoPayments = dbPoPayments.filter(p => poIds.has(p.poId));
  const filteredQuotes = dbQuotes.filter(q => prIds.has(q.prId));

  const data = {
    suppliers: dbSuppliers,
    products: dbProducts,
    prs: dbPrs.map(pr => ({
      ...pr,
      items: filteredPrItems.filter(i => i.prId === pr.id).map(i => ({ ...i, id: i.originalId }))
    })),
    pos: dbPos.map(po => ({
      ...po,
      items: filteredPoItems.filter(i => i.poId === po.id).map(i => ({
        ...i,
        id: i.originalId,
        allocations: filteredPoAllocations.filter(a => a.poItemId === i.id)
      })),
      docs: filteredPoDocs.filter(d => d.poId === po.id),
      payments: filteredPoPayments.filter(p => p.poId === po.id)
    })),
    quotes: {} as any,
    purchaseHistory: dbHistory,
    trash: dbTrash.map(t => ({
      ...t,
      data: t.data ? JSON.parse(t.data) : null
    }))
  };

  filteredQuotes.forEach(q => {
    if (!data.quotes[q.prId]) data.quotes[q.prId] = {};
    data.quotes[q.prId][q.supplierId] = {
      price: q.price,
      note: q.note,
      priceMode: q.priceMode,
      vatRate: q.vatRate
    };
  });

  return Response.json({ data, updatedAt: new Date().toISOString(), version: 2, workspaceId });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Yêu cầu đăng nhập" }, { status: 401 });

  const env = await bindings();
  const rawDb = env.DB;
  const drizzleDb = getDb();
  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const data = await request.json();
  const now = new Date().toISOString();

  const payloadStr = JSON.stringify(data);
  if (payloadStr.length > 20_000_000) {
    return Response.json({ error: "Dữ liệu vượt giới hạn hệ thống (20MB)" }, { status: 413 });
  }

  const stmts: any[] = [];
  
  // Backward compatibility: Merge and save to app_state
  try {
    const existingRow = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
    let mergedStr = payloadStr;
    if (existingRow) {
      const existingData = JSON.parse(existingRow.payload);
      mergedStr = JSON.stringify({ ...existingData, ...data });
    }
    if (mergedStr.length <= 1_800_000) {
      stmts.push(rawDb.prepare("INSERT INTO app_state (id,payload,updated_at,version) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,version=app_state.version+1").bind(stateId(workspaceId), mergedStr, now));
    }
  } catch (e) {
    console.error("Lỗi khi gộp app_state cũ", e);
  }

  if (data.suppliers !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM suppliers WHERE workspace_id = ?").bind(workspaceId));
    for (const s of data.suppliers) {
      stmts.push(rawDb.prepare(`INSERT INTO suppliers (id, workspace_id, code, name, bank_account, bank, address, contact, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(s.id, workspaceId, s.code || "", s.name || "", s.bankAccount || null, s.bank || null, s.address || null, s.contact || null, s.phone || null));
    }
  }

  if (data.products !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM products WHERE workspace_id = ?").bind(workspaceId));
    for (const p of data.products) {
      stmts.push(rawDb.prepare(`INSERT INTO products (id, workspace_id, code, category, name, desc, spec, unit, estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(p.id, workspaceId, p.code || "", p.category || null, p.name || "", p.desc || null, p.spec || null, p.unit || null, p.estimate || 0));
    }
  }

  if (data.prs !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM prs WHERE workspace_id = ?").bind(workspaceId));
    stmts.push(rawDb.prepare("DELETE FROM quotes WHERE pr_id IN (SELECT id FROM prs WHERE workspace_id = ?)").bind(workspaceId));
    for (const pr of data.prs) {
      stmts.push(rawDb.prepare(`INSERT INTO prs (id, workspace_id, number, date, department, purpose, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(pr.id, workspaceId, pr.number || "", pr.date || null, pr.department || null, pr.purpose || null, pr.status || "", pr.note || null));
      if (pr.items) {
        for (const item of pr.items) {
          stmts.push(rawDb.prepare(`INSERT INTO pr_items (pr_id, original_id, code, category, name, desc, spec, unit, qty, estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(pr.id, item.id, item.code || null, item.category || null, item.name || null, item.desc || null, item.spec || null, item.unit || null, item.qty || 0, item.estimate || 0));
        }
      }
      if (data.quotes && data.quotes[pr.id]) {
        for (const supplierId of Object.keys(data.quotes[pr.id])) {
          const q = data.quotes[pr.id][supplierId];
          stmts.push(rawDb.prepare(`INSERT INTO quotes (pr_id, supplier_id, price, note, price_mode, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`).bind(pr.id, Number(supplierId), q.price || "", q.note || "", q.priceMode || null, q.vatRate || null));
        }
      }
    }
  }

  if (data.pos !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM pos WHERE workspace_id = ?").bind(workspaceId));
    for (const po of data.pos) {
      stmts.push(rawDb.prepare(`INSERT INTO pos (id, workspace_id, number, pr_number, supplier_id, created_date, expected_date, status, note, contract_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(po.id, workspaceId, po.number || "", po.prNumber || null, po.supplierId || null, po.createdDate || null, po.expectedDate || null, po.status || "", po.note || null, po.contractNote || null));
      if (po.docs) {
        for (const doc of po.docs) {
          stmts.push(rawDb.prepare(`INSERT INTO po_docs (id, po_id, name, status, note) VALUES (?, ?, ?, ?, ?)`).bind(doc.id, po.id, doc.name || null, doc.status || null, doc.note || null));
        }
      }
      if (po.payments) {
        for (const p of po.payments) {
          stmts.push(rawDb.prepare(`INSERT INTO po_payments (id, po_id, phase, percent, amount, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(p.id, po.id, p.phase || null, p.percent || 0, p.amount || 0, p.status || null, p.date || null));
        }
      }
      if (po.items) {
        for (const item of po.items) {
          stmts.push(rawDb.prepare(`INSERT INTO po_items (po_id, original_id, code, category, name, desc, spec, unit, qty, estimate, price, delivery_status, delivered_qty, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(po.id, item.id, item.code || null, item.category || null, item.name || null, item.desc || null, item.spec || null, item.unit || null, item.qty || 0, item.estimate || 0, item.price || 0, item.deliveryStatus || null, item.deliveredQty || 0, item.deliveryDate || null));
        }
      }
    }
  }

  if (data.purchaseHistory !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM purchase_history WHERE workspace_id = ?").bind(workspaceId));
    for (const h of data.purchaseHistory) {
      stmts.push(rawDb.prepare(`INSERT INTO purchase_history (id, workspace_id, warehouse_code, warehouse_name, item_code, item_name, accounting_date, document_date, document_no, invoice_date, invoice_no, description, unit, unit_price, quantity, value, supplier_code, supplier_name, supplier_id, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(h.id, workspaceId, h.warehouseCode || null, h.warehouseName || null, h.itemCode || null, h.itemName || null, h.accountingDate || null, h.documentDate || null, h.documentNo || null, h.invoiceDate || null, h.invoiceNo || null, h.description || null, h.unit || null, h.unitPrice || 0, h.quantity || 0, h.value || 0, h.supplierCode || null, h.supplierName || null, h.supplierId || null, h.department || null));
    }
  }
  
  if (data.trash !== undefined) {
    stmts.push(rawDb.prepare("DELETE FROM trash_items WHERE workspace_id = ?").bind(workspaceId));
    for (const t of data.trash) {
      stmts.push(rawDb.prepare(`INSERT INTO trash_items (id, workspace_id, type, label, deleted_at, expires_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(t.id, workspaceId, t.type || null, t.label || null, t.deletedAt || null, t.expiresAt || null, t.data ? JSON.stringify(t.data) : null));
    }
  }

  stmts.push(rawDb.prepare("INSERT INTO audit_logs (action,entity_type,entity_id,created_at) VALUES (?,?,?,?)").bind("SAVE","application", workspaceId, now));

  for (let i = 0; i < stmts.length; i += 50) {
    const batch = stmts.slice(i, i + 50);
    if (batch.length > 0) {
      await rawDb.batch(batch);
    }
  }

  return Response.json({ ok: true, updatedAt: now });
}
