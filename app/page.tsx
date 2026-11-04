import dynamicImport from "next/dynamic";
import LoginForm from "./components/LoginForm";
import { getCurrentUser } from "./auth";

const ProcurementApp = dynamicImport(() => import("./ProcurementApp"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#475569" }}>
      <div style={{ width: 40, height: 40, border: "3px solid #cbd5e1", borderTopColor: "#0284c7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ marginTop: 16, fontSize: 14, fontWeight: 600 }}>Đang tải hệ thống Phenikaa Pharma...</p>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes spin { to { transform: rotate(360deg); } }" }} />
    </div>
  ),
});

export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getCurrentUser();
  return user ? <ProcurementApp key={user.id} currentUser={user} /> : <LoginForm />;
}
