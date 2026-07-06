"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = { href: string; label: string; icon: string; perm?: string };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "▦" }],
  },
  {
    section: "Academic setup",
    items: [
      { href: "/periods", label: "Academic periods", icon: "🗓", perm: "entities:read" },
      { href: "/programs", label: "Programs", icon: "🎓", perm: "entities:read" },
      { href: "/batches", label: "Batches", icon: "👥", perm: "entities:read" },
      { href: "/sections", label: "Sections", icon: "𝗔", perm: "entities:read" },
      { href: "/groups", label: "Lab groups", icon: "⚗", perm: "entities:read" },
      { href: "/courses", label: "Courses", icon: "📘", perm: "entities:read" },
      { href: "/offerings", label: "Offerings", icon: "🧩", perm: "entities:read" },
    ],
  },
  {
    section: "Resources",
    items: [
      { href: "/rooms", label: "Rooms", icon: "🚪", perm: "entities:read" },
      { href: "/instructors", label: "Instructors", icon: "🧑‍🏫", perm: "entities:read" },
      { href: "/slot-templates", label: "Slot templates", icon: "⏱", perm: "entities:read" },
    ],
  },
  {
    section: "Scheduling",
    items: [{ href: "/schedules", label: "Schedules", icon: "🧮", perm: "entities:read" }],
  },
  {
    section: "Data",
    items: [{ href: "/imports", label: "Imports", icon: "⇪", perm: "data:import" }],
  },
];

export function Shell({
  user, children,
}: {
  user: { fullName: string; email: string; roles: string[]; permissions: string[] };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false); // desktop icon-rail
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const pathname = usePathname();
  const router = useRouter();
  const perms = new Set(user.permissions);
  const allowed = (p?: string) => !p || perms.has(p) || perms.has("*");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {NAV.map((group) => {
        const items = group.items.filter((i) => allowed(i.perm));
        if (items.length === 0) return null;
        return (
          <div key={group.section} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.section}
              </div>
            )}
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13.5px]
                    ${active ? "bg-brand-soft font-medium text-brand-dark" : "text-ink-muted hover:bg-surface hover:text-ink"}`}
                >
                  <span className="w-5 text-center text-[15px] leading-none">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-dvh flex-col border-r border-line bg-card transition-[width] duration-200 md:flex
          ${collapsed ? "w-[60px]" : "w-[232px]"}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-3.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">H</span>
          {!collapsed && <span className="truncate text-[14px] font-semibold">HiLCoE Scheduler</span>}
        </div>
        {nav}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="border-t border-line px-3 py-2.5 text-left text-[12.5px] text-ink-faint hover:text-ink cursor-pointer"
        >
          {collapsed ? "»" : "« Collapse"}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[248px] flex-col border-r border-line bg-card">
            <div className="flex h-14 items-center gap-2 border-b border-line px-3.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">H</span>
              <span className="text-[14px] font-semibold">HiLCoE Scheduler</span>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur">
          <button
            className="grid h-9 w-9 place-items-center rounded-control border border-line text-[17px] md:hidden cursor-pointer"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex-1" />
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[13px] font-medium">{user.fullName}</div>
            <div className="text-[11.5px] text-ink-faint">{user.roles.join(" · ") || user.email}</div>
          </div>
          <button
            onClick={logout}
            className="rounded-control border border-line px-3 py-1.5 text-[12.5px] text-ink-muted hover:bg-surface cursor-pointer"
          >
            Sign out
          </button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
