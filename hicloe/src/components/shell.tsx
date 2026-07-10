"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, CalendarRange, GraduationCap, Users, Rows3, FlaskConical,
  BookOpen, Puzzle, DoorOpen, UserRound, CalendarClock, CalendarCheck2,
  Upload, Megaphone, Menu, ChevronsLeft, ChevronsRight, LogOut,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; icon: LucideIcon; perm?: string };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Academic setup",
    items: [
      { href: "/periods", label: "Academic periods", icon: CalendarRange, perm: "entities:read" },
      { href: "/programs", label: "Programs", icon: GraduationCap, perm: "entities:read" },
      { href: "/batches", label: "Batches", icon: Users, perm: "entities:read" },
      { href: "/sections", label: "Sections", icon: Rows3, perm: "entities:read" },
      { href: "/groups", label: "Lab groups", icon: FlaskConical, perm: "entities:read" },
      { href: "/courses", label: "Courses", icon: BookOpen, perm: "entities:read" },
      { href: "/offerings", label: "Offerings", icon: Puzzle, perm: "entities:read" },
    ],
  },
  {
    section: "Resources",
    items: [
      { href: "/rooms", label: "Rooms", icon: DoorOpen, perm: "entities:read" },
      { href: "/instructors", label: "Instructors", icon: UserRound, perm: "entities:read" },
      { href: "/slot-templates", label: "Slot templates", icon: CalendarClock, perm: "entities:read" },
    ],
  },
  {
    section: "Scheduling",
    items: [{ href: "/schedules", label: "Schedules", icon: CalendarCheck2, perm: "entities:read" }],
  },
  {
    section: "Data",
    items: [{ href: "/imports", label: "Imports", icon: Upload, perm: "data:import" }],
  },
  {
    section: "Communication",
    items: [{ href: "/broadcast", label: "Broadcast", icon: Megaphone, perm: "broadcast:send" }],
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
    <nav className="flex-1 overflow-y-auto px-2.5 py-3">
      {NAV.map((group) => {
        const items = group.items.filter((i) => allowed(i.perm));
        if (items.length === 0) return null;
        return (
          <div key={group.section} className="mb-4">
            {!collapsed && (
              <div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.section}
              </div>
            )}
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`nav-item ${active ? "active" : ""} ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="nav-icon">
                    <Icon size={18} strokeWidth={2} />
                  </span>
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
          ${collapsed ? "w-[68px]" : "w-[240px]"}`}
      >
        <div className={`flex h-16 items-center gap-2.5 border-b border-line ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <Logo size={32} className="shrink-0 drop-shadow-[0_2px_6px_rgba(33,88,209,0.35)]" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[14px] font-bold tracking-tight">HiLCoE</div>
              <div className="truncate text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">Scheduler</div>
            </div>
          )}
        </div>
        {nav}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center gap-1.5 border-t border-line px-3 py-3 text-[12.5px] font-medium text-ink-faint transition-colors hover:bg-surface hover:text-ink cursor-pointer"
        >
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[260px] flex-col border-r border-line bg-card-strong">
            <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
              <Logo size={32} className="shrink-0" />
              <div className="leading-tight">
                <div className="text-[14px] font-bold tracking-tight">HiLCoE</div>
                <div className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">Scheduler</div>
              </div>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur-xl md:px-6">
          <button
            className="grid h-9 w-9 place-items-center rounded-control border border-line text-ink md:hidden cursor-pointer"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <ThemeToggle />
          <div className="mx-1 hidden h-8 w-px bg-line sm:block" />
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[13px] font-semibold">{user.fullName}</div>
            <div className="text-[11.5px] text-ink-faint">{user.roles.join(" · ") || user.email}</div>
          </div>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand sm:flex">
            {user.fullName.slice(0, 1).toUpperCase()}
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:border-danger-soft hover:bg-danger-soft hover:text-danger cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
