import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Shell } from "@/components/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <Shell
      user={{
        fullName: user.fullName,
        email: user.email,
        roles: user.roles,
        permissions: [...user.permissions],
      }}
    >
      {children}
    </Shell>
  );
}
