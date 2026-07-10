import Link from "next/link";
import {
  CalendarRange, GraduationCap, Users, Rows3, BookOpen, Puzzle, DoorOpen,
  UserRound, CalendarClock, Upload, ArrowRight, Sparkles, CircleAlert, type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const stateTone: Record<string, "gray" | "blue" | "green" | "red" | "amber"> = {
  DRAFT: "gray", GENERATING: "amber", GENERATED: "blue", FAILED: "red",
  IN_REVIEW: "amber", APPROVED: "green", PUBLISHED: "green", ARCHIVED: "gray",
};

async function latestScheduleByPeriodType(type: "SEMESTER" | "TERM") {
  const schedule = await db.schedule.findFirst({
    where: { period: { type }, versions: { some: {} } },
    orderBy: { createdAt: "desc" },
    include: {
      period: true,
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { _count: { select: { sessions: true } } },
      },
    },
  });
  if (!schedule) return null;
  const version = schedule.versions[0];
  const solverStatus = (version?.solverResponse as { status?: string } | null)?.status ?? null;
  const assignmentCount = version
    ? await db.assignment.count({ where: { versionId: version.id } })
    : 0;
  return { schedule, version, solverStatus, assignmentCount };
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  const [periods, programs, batches, sections, courses, offerings, rooms, instructors, templates, imports] =
    await Promise.all([
      db.academicPeriod.count(),
      db.program.count(),
      db.batch.count({ where: { deletedAt: null } }),
      db.section.count({ where: { deletedAt: null } }),
      db.course.count({ where: { deletedAt: null } }),
      db.courseOffering.count({ where: { deletedAt: null } }),
      db.room.count({ where: { deletedAt: null } }),
      db.instructor.count({ where: { deletedAt: null } }),
      db.slotTemplate.count(),
      db.importBatch.count(),
    ]);

  const [semester, term] = await Promise.all([
    latestScheduleByPeriodType("SEMESTER"),
    latestScheduleByPeriodType("TERM"),
  ]);

  const cards: [string, number, string, LucideIcon][] = [
    ["Academic periods", periods, "/periods", CalendarRange],
    ["Programs", programs, "/programs", GraduationCap],
    ["Batches", batches, "/batches", Users],
    ["Sections", sections, "/sections", Rows3],
    ["Courses", courses, "/courses", BookOpen],
    ["Offerings", offerings, "/offerings", Puzzle],
    ["Rooms", rooms, "/rooms", DoorOpen],
    ["Instructors", instructors, "/instructors", UserRound],
    ["Slot templates", templates, "/slot-templates", CalendarClock],
    ["Imports", imports, "/imports", Upload],
  ];

  const recent = (await db.auditLog.findMany({
    orderBy: { id: "desc" },
    take: 8,
    include: { actor: { select: { fullName: true } } },
  })).map((r) => ({
    id: r.id.toString(),
    at: r.at.toISOString().replace("T", " ").slice(0, 16),
    actor: r.actor?.fullName ?? "system",
    action: r.action,
    entity: r.entityType ? `${r.entityType}` : "",
  }));

  return (
    <div>
      <h1 className="mb-1 text-[21px] font-bold tracking-tight">Dashboard</h1>
      <p className="mb-6 text-[13.5px] text-ink-muted">Welcome back, {user?.fullName}.</p>

      {/* Latest timetables — Semester + Term, front and center */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <LatestScheduleCard label="Semester" data={semester} />
        <LatestScheduleCard label="Term" data={term} />
      </div>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">At a glance</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, count, href, Icon]) => (
          <Link key={href} href={href} className="stat-tile group">
            <div className="mb-2.5 grid h-9 w-9 place-items-center rounded-control bg-brand-soft text-brand transition-transform group-hover:scale-105">
              <Icon size={18} strokeWidth={2} />
            </div>
            <div className="text-[24px] font-bold leading-none tracking-tight">{count}</div>
            <div className="mt-1.5 text-[12.5px] text-ink-muted">{label}</div>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Recent activity</h2>
      <div className="glass-panel overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-b border-line text-[13px] last:border-0">
                <td className="px-4 py-2.5 text-ink-faint whitespace-nowrap">{r.at}</td>
                <td className="px-4 py-2.5 font-medium">{r.actor}</td>
                <td className="px-4 py-2.5">{r.action}</td>
                <td className="px-4 py-2.5 text-ink-muted">{r.entity}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-[13px] text-ink-faint">No activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LatestScheduleCard({
  label, data,
}: {
  label: string;
  data: Awaited<ReturnType<typeof latestScheduleByPeriodType>>;
}) {
  if (!data) {
    return (
      <div className="glass-panel flex flex-col items-start justify-center gap-2 p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
        <p className="text-[13.5px] text-ink-muted">No timetable generated yet for this period type.</p>
        <Link href="/schedules" className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
          Go to schedules <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  const { schedule, version, solverStatus, assignmentCount } = data;
  const ok = solverStatus === "OPTIMAL" || solverStatus === "FEASIBLE";
  const href = version && ok
    ? `/schedules/${schedule.id}/versions/${version.id}`
    : `/schedules/${schedule.id}`;

  return (
    <Link href={href} className="glass-panel group relative block overflow-hidden p-5 transition-all hover:border-line-strong hover:-translate-y-0.5">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-90"
        style={{ background: ok ? "var(--brand-soft)" : "var(--warning-soft)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
          <h3 className="truncate text-[16px] font-bold tracking-tight">{schedule.period.name}</h3>
        </div>
        <Badge tone={stateTone[schedule.state] ?? "gray"}>{schedule.state.toLowerCase()}</Badge>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <div className="flex items-center gap-1.5">
          {ok ? <Sparkles size={15} className="text-brand" /> : <CircleAlert size={15} className="text-warning" />}
          <span className={ok ? "font-semibold text-brand" : "font-semibold text-warning"}>
            {solverStatus ? solverStatus.toLowerCase() : "pending"}
          </span>
        </div>
        <div className="text-ink-muted">v{version?.number ?? "—"}</div>
        <div className="text-ink-muted">{assignmentCount} sessions placed</div>
        {version?.objectivePenalty != null && (
          <div className="text-ink-muted">penalty {version.objectivePenalty}</div>
        )}
      </div>

      <div className="relative mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
        {ok ? "View timetable" : "Open schedule"} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
