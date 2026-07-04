import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <main className="auth-wrap">
      <div className="card">
        <h1>Welcome, {user.fullName}</h1>
        <p className="sub">
          Signed in as {user.email} · roles: {user.roles.join(", ") || "none"}
        </p>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          Phase 1 skeleton is running. The scheduling console arrives in phase 2.
        </p>
      </div>
    </main>
  );
}
