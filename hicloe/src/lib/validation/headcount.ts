import { db } from "@/lib/db";

/**
 * The import pipeline already warns when a section's lab groups don't sum to
 * its headcount (see lib/import/pipeline.ts) — this is the same check for
 * the hand-authored CRUD path (creating/editing groups or sections directly
 * in the UI), which had no such cross-check at all before this.
 */
export async function warnGroupHeadcountMismatch(sectionId: string): Promise<string | undefined> {
  const section = await db.section.findUnique({
    where: { id: sectionId },
    include: { groups: { where: { deletedAt: null } } },
  });
  // A section with no lab groups at all is a normal, common configuration
  // (the whole section attends labs together) — only warn once someone has
  // actually started subdividing it into groups.
  if (!section || section.groups.length === 0) return undefined;
  const sum = section.groups.reduce((s, g) => s + g.headcount, 0);
  if (sum !== section.headcount) {
    return `Lab groups of section '${section.name}' sum to ${sum} but the section's headcount is ${section.headcount}`;
  }
  return undefined;
}
