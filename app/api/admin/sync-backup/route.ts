import { getCurrentUser } from "../../../auth";

async function bindings() {
  return (await import("cloudflare:workers")).env;
}

export async function POST(request: Request) {
  const env = await bindings();
  const configuredSyncSecret = (env.SYNC_SECRET as string | undefined)?.trim();
  const authHeader = request.headers.get("x-sync-secret")?.trim();

  // Allow either an authenticated Master/Admin session or a valid secret header matching env.SYNC_SECRET
  const user = await getCurrentUser();
  const isMasterOrAdmin = user && (user.role === "master" || user.role === "admin");
  const isSecretValid = Boolean(configuredSyncSecret && authHeader && authHeader === configuredSyncSecret);

  if (!isMasterOrAdmin && !isSecretValid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = env.DB;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    paymentGroups,
    paymentRequests,
    paymentHandovers,
    paymentBeneficiaries,
    paymentTemplate,
    suppliers,
  } = body;

  const targetIds = [
    "procurement",
    "procurement:b7f7f770-898b-4e2d-983f-9e640a42950d",
  ];

  for (const id of targetIds) {
    const existing = await db
      .prepare("SELECT payload FROM app_state WHERE id = ?")
      .bind(id)
      .first<{ payload: string }>();

    let payloadObj: any = {};
    if (existing && existing.payload) {
      try {
        payloadObj = JSON.parse(existing.payload);
      } catch {
        payloadObj = {};
      }
    }

    if (paymentGroups !== undefined) payloadObj.paymentGroups = paymentGroups;
    if (paymentRequests !== undefined) payloadObj.paymentRequests = paymentRequests;
    if (paymentHandovers !== undefined) payloadObj.paymentHandovers = paymentHandovers;
    if (paymentBeneficiaries !== undefined) payloadObj.paymentBeneficiaries = paymentBeneficiaries;
    if (paymentTemplate !== undefined) payloadObj.paymentTemplate = paymentTemplate;
    if (suppliers !== undefined) payloadObj.suppliers = suppliers;

    const payloadStr = JSON.stringify(payloadObj);
    await db
      .prepare(
        "UPDATE app_state SET payload = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .bind(payloadStr, id)
      .run();
  }

  return Response.json({
    ok: true,
    requestsCount: paymentRequests?.length,
    handoversCount: paymentHandovers?.length,
    groupsCount: paymentGroups?.length,
  });
}
