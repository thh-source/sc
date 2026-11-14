import { NextResponse } from "next/server";
import { getCurrentUser } from "../../auth";
import seedData from "../../data/purchase-history-t1-t7-2026.json";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(seedData);
}
