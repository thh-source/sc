import WorkspaceSelector from "./WorkspaceSelector";
import LoginForm from "./LoginForm";
import { getCurrentUser } from "./auth";

export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getCurrentUser();
  return user ? <WorkspaceSelector currentUser={user} /> : <LoginForm />;
}
