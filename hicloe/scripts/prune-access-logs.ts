/**
 * AccessLog logs every request, including reads, so it grows much faster than
 * AuditLog. Run this periodically (cron / scheduled task) to bound its size —
 * it is a plain retention prune, not a security control, so it's deliberately
 * kept as a manual/cron-able script rather than an in-process background job.
 *
 * Usage: npm run logs:prune            (default 90-day retention)
 *        ACCESS_LOG_RETENTION_DAYS=30 npm run logs:prune
 */
import "dotenv/config";
import { db } from "../src/lib/db";

const DAYS = Number(process.env.ACCESS_LOG_RETENTION_DAYS ?? 90);

async function main() {
  const cutoff = new Date(Date.now() - DAYS * 24 * 3600_000);
  const { count } = await db.accessLog.deleteMany({ where: { at: { lt: cutoff } } });
  console.log(`Pruned ${count} access_log row(s) older than ${DAYS} days (before ${cutoff.toISOString()}).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
