import { getChatGPTUser } from "../../chatgpt-auth";
import { resolveWorkspace } from "../../state-store";
import { getDb } from "../../../db";
import { prs, prItems } from "../../../db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  
  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const db = getDb();
  
  const prList = await db.select().from(prs).where(eq(prs.workspaceId, workspaceId));
  if (prList.length === 0) return Response.json([]);

  const prIds = prList.map(pr => pr.id);
  const items = await db.select().from(prItems).where(inArray(prItems.prId, prIds));
  
  const result = prList.map(pr => ({
    ...pr,
    items: items.filter(i => i.prId === pr.id).map(i => ({
      id: i.originalId,
      code: i.code,
      category: i.category,
      name: i.name,
      desc: i.desc,
      spec: i.spec,
      unit: i.unit,
      qty: i.qty,
      estimate: i.estimate
    }))
  }));

  return Response.json(result);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  
  const workspaceId = await resolveWorkspace(user, new URL(request.url).searchParams.get("workspace"));
  const db = getDb();
  const data = await request.json(); // array of PRs

  // Drizzle batch insert or sequential
  // Since D1 doesn't support complex upserts easily with nested items, we can just delete all PRs for the workspace and re-insert them, or implement proper diffing.
  // For a transitional phase, replacing all PRs is similar to replacing the JSON blob, but at least PRs are their own table.
  
  await db.delete(prs).where(eq(prs.workspaceId, workspaceId));
  
  if (data.length > 0) {
    await db.insert(prs).values(data.map((pr: any) => ({
      id: pr.id,
      workspaceId,
      number: pr.number,
      date: pr.date,
      department: pr.department,
      purpose: pr.purpose,
      status: pr.status,
      note: pr.note
    })));

    const allItems = data.flatMap((pr: any) => (pr.items || []).map((i: any) => ({
      prId: pr.id,
      originalId: i.id,
      code: i.code,
      category: i.category,
      name: i.name,
      desc: i.desc,
      spec: i.spec,
      unit: i.unit,
      qty: i.qty,
      estimate: i.estimate
    })));

    if (allItems.length > 0) {
      // Chunking if too many
      for (let i = 0; i < allItems.length; i += 100) {
        await db.insert(prItems).values(allItems.slice(i, i + 100));
      }
    }
  }

  return Response.json({ ok: true });
}
