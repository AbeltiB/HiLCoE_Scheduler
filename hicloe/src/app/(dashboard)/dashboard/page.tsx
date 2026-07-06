import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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

  const cards: [string, number, string][] = [
    ["Academic periods", periods, "/periods"],
    ["Programs", programs, "/programs"],
    ["Batches", batches, "/batches"],
    ["Sections", sections, "/sections"],
    ["Courses", courses, "/courses"],
    ["Offerings", offerings, "/offerings"],
    ["Rooms", rooms, "/rooms"],
    ["Instructors", instructors, "/instructors"],
    ["Slot templates", templates, "/slot-templates"],
    ["Imports", imports, "/imports"],
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
      <h1 className="mb-1 text-[19px] font-semibold">Dashboard</h1>
      <p className="mb-5 text-[13px] text-ink-muted">Welcome back, {user?.fullName}.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, count, href]) => (
          <Link key={href} href={href}
            className="rounded-card border border-line bg-card p-4 transition-colors hover:border-line-strong">
            <div className="text-[24px] font-semibold leading-none">{count}</div>
            <div className="mt-1.5 text-[12.5px] text-ink-muted">{label}</div>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-[15px] font-semibold">Recent activity</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[480px]">
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-b border-line text-[13px] last:border-0">
                <td className="px-3 py-2 text-ink-faint whitespace-nowrap">{r.at}</td>
                <td className="px-3 py-2 font-medium">{r.actor}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2 text-ink-muted">{r.entity}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-[13px] text-ink-faint">No activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
