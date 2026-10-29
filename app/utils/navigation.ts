import type { View } from "../types";

export interface AppRoute {
  view: View;
  id?: number;
  prId?: number;
  poId?: number;
  tab?: string;
  modal?: string;
  isPrint?: boolean;
}

/**
 * Phân tích URL Hash hiện tại thành đối tượng AppRoute có cấu trúc
 * Hỗ trợ các chuẩn URL chính và các alias tương thích ngược
 */
export function parseRouteFromHash(hashString?: string): AppRoute {
  let rawHash = (
    hashString !== undefined
      ? hashString
      : typeof window !== "undefined"
      ? window.location.hash
      : ""
  ).replace(/^#/, "");

  if (!rawHash) {
    return { view: "dashboard" };
  }

  // Hỗ trợ dạng hash đơn giản như #dashboard, #prs, #approval
  if (!rawHash.includes("=") && !rawHash.includes("&")) {
    const simple = rawHash.toLowerCase().trim();
    if (simple === "dashboard") return { view: "dashboard" };
    if (simple === "prs" || simple === "pr") return { view: "prs" };
    if (simple === "create") return { view: "create" };
    if (simple === "compare") return { view: "compare" };
    if (simple === "approval") return { view: "approval" };
    if (simple === "po-list" || simple === "po") return { view: "po-list" };
    if (simple === "contracts" || simple === "contract") return { view: "contracts" };
    if (simple === "payment" || simple === "payments") return { view: "payment" };
    if (simple === "handover") return { view: "handover" };
    if (simple === "suppliers") return { view: "suppliers" };
    if (simple === "products") return { view: "products" };
    if (simple === "catalog") return { view: "catalog" };
    if (simple === "trash") return { view: "trash" };
    if (simple === "settings") return { view: "settings" };
    if (simple === "print-templates") return { view: "print-templates" };
    if (simple === "guide" || simple === "help") return { view: "guide" };
  }

  const params = new URLSearchParams(rawHash);
  const rawView = (params.get("view") || "").toLowerCase().trim();

  const rawId = params.get("id");
  const rawTab = params.get("tab")?.toLowerCase().trim();
  const rawPr =
    params.get("pr") ||
    params.get("prId") ||
    (rawTab === "comparison" || rawTab === "compare" ? rawId : null);
  const rawPo = params.get("po") || params.get("poId");
  const isPrint =
    params.get("print") === "1" ||
    params.get("print") === "true" ||
    rawView === "print_approval";
  const modal = params.get("modal") || undefined;

  const id = rawId && !isNaN(Number(rawId)) ? Number(rawId) : undefined;
  const prId = rawPr && !isNaN(Number(rawPr)) ? Number(rawPr) : undefined;
  const poId = rawPo && !isNaN(Number(rawPo)) ? Number(rawPo) : undefined;

  let view: View = "dashboard";

  switch (rawView) {
    case "dashboard":
      view = "dashboard";
      break;

    case "prs":
    case "pr":
      if (rawTab === "comparison" || rawTab === "compare" || prId || id) {
        view = "compare";
      } else {
        view = "prs";
      }
      break;

    case "create":
    case "pr-create":
      view = "create";
      break;

    case "pr-compare":
    case "compare":
    case "comparison":
      view = "compare";
      break;

    case "approval":
    case "approval_detail":
    case "print_approval":
      view = "approval";
      break;

    case "po":
      view = id || poId ? "po-detail" : "po-list";
      break;

    case "po-list":
      view = "po-list";
      break;

    case "po-detail":
      view = "po-detail";
      break;

    case "contracts":
    case "contract":
      view = "contracts";
      break;

    case "payment":
    case "payments":
      view = "payment";
      break;

    case "handover":
      view = "handover";
      break;

    case "suppliers":
      view = "suppliers";
      break;

    case "products":
      view = "products";
      break;

    case "catalog":
      view = "catalog";
      break;

    case "trash":
      view = "trash";
      break;

    case "settings":
      view = "settings";
      break;

    case "print-templates":
      view = "print-templates";
      break;

    case "guide":
    case "help":
      view = "guide";
      break;

    default:
      view = "dashboard";
  }

  const resolvedId =
    id ||
    (view === "po-detail"
      ? poId
      : view === "compare"
      ? prId
      : undefined);

  return {
    view,
    id: resolvedId,
    prId: prId || (view === "compare" ? (id || resolvedId) : undefined),
    poId: poId || (view === "po-detail" ? id : undefined),
    tab: rawTab,
    modal,
    isPrint,
  };
}

/**
 * Xây dựng chuỗi Hash URL chuẩn hóa từ đối tượng AppRoute
 */
export function buildHashFromRoute(route: AppRoute): string {
  const params = new URLSearchParams();

  if (route.view === "dashboard" && !route.id && !route.prId && !route.poId) {
    return "#view=dashboard";
  }

  if (route.view === "compare") {
    const prParam = route.prId || route.id;
    params.set("view", "pr-compare");
    if (prParam) {
      params.set("prId", String(prParam));
    }
  } else {
    params.set("view", route.view);
  }

  if (route.view === "approval") {
    if (route.id) params.set("id", String(route.id));
    if (route.prId) params.set("pr", String(route.prId));
    if (route.isPrint) params.set("print", "1");
  } else if (route.view === "po-detail") {
    if (route.id || route.poId) {
      params.set("id", String(route.id || route.poId));
    }
  } else if (route.view === "contracts") {
    if (route.id) params.set("id", String(route.id));
  } else if (route.view === "payment") {
    if (route.id) params.set("id", String(route.id));
  } else if (route.view === "handover") {
    if (route.id) params.set("id", String(route.id));
  } else if (route.view === "catalog") {
    if (route.tab) params.set("tab", route.tab);
  }

  if (route.modal) {
    params.set("modal", route.modal);
  }

  const query = params.toString();
  return query ? `#${query}` : "#view=dashboard";
}

/**
 * Hàm điều hướng chuẩn hóa, đồng bộ window.history và dispatch event
 * - replace = false (mặc định): pushState để lưu lại bước duyệt trang (Back được)
 * - replace = true: replaceState để ghi đè lịch sử (chuyển hướng ngầm, fallback)
 */
export function navigateTo(
  route: AppRoute,
  options?: { replace?: boolean }
) {
  if (typeof window === "undefined") return;

  const newHash = buildHashFromRoute(route);
  const currentHash = window.location.hash;

  if (newHash === currentHash) {
    return;
  }

  const url = `${window.location.pathname}${window.location.search}${newHash}`;

  if (options?.replace) {
    window.history.replaceState({ ...route, hash: newHash }, "", url);
  } else {
    window.history.pushState({ ...route, hash: newHash }, "", url);
  }

  window.dispatchEvent(
    new CustomEvent("scm_route_change", { detail: route })
  );
}
