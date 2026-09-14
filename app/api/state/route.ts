import { getChatGPTUser } from "../../chatgpt-auth";
import { resolveWorkspace, stateId } from "../../state-store";
import { getDb } from "../../../db";
import { appState } from "../../../db/schema";
import { eq } from "drizzle-orm";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Không có quy?n truy c?p" }, { status: 401 });

  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const drizzleDb = getDb();

  const row = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
  if (!row) {
    const fallback = await drizzleDb.select().from(appState).where(eq(appState.id, "procurement")).get();
    if (fallback) {
       return Response.json({ data: JSON.parse(fallback.payload), updatedAt: fallback.updatedAt, version: fallback.version, workspaceId });
    }
    return Response.json({ data: null, updatedAt: null, version: 0, workspaceId });
  }
  
  return Response.json({ data: JSON.parse(row.payload), updatedAt: row.updatedAt, version: row.version, workspaceId });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Không có quy?n truy c?p" }, { status: 401 });

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return Response.json({ error: "JSON không h?p l?" }, { status: 400 });
  }

  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const drizzleDb = getDb();
  
  const payloadStr = JSON.stringify(data);
  const now = new Date().toISOString();
  
  try {
    const existing = await drizzleDb.select().from(appState).where(eq(appState.id, stateId(workspaceId))).get();
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

