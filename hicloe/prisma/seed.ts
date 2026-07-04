/**
 * Seed: permission catalog, system roles, bootstrap SUPER_ADMIN (INVITED —
 * they activate via email like everyone else, keeping one auth path).
 * Idempotent: safe to re-run.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/lib/authz/permissions";
import { createHash, randomBytes } from "crypto";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

async function main() {
  // 1. Permissions
  for (const action of [...PERMISSIONS, "*"]) {
    await db.permission.upsert({
      where: { action_resource: { action, resource: "*" } },
      update: {},
      create: { action, resource: "*" },
    });
  }

  // 2. System roles
  for (const [name, actions] of Object.entries(SYSTEM_ROLES)) {
    const perms = await db.permission.findMany({
      where: { action: { in: actions as string[] } },
    });
    await db.role.upsert({
      where: { name },
      update: { permissions: { set: perms.map((p) => ({ id: p.id })) }, system: true },
      create: { name, system: true, permissions: { connect: perms.map((p) => ({ id: p.id })) } },
    });
  }

  // 3. Bootstrap super admin
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase();
  if (!email) throw new Error("SUPERADMIN_EMAIL not set");
  const superRole = await db.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    const user = await db.user.create({
      data: {
        email,
        fullName: process.env.SUPERADMIN_NAME ?? "Super Admin",
        status: "INVITED",
        roles: { connect: { id: superRole.id } },
      },
    });
    const raw = randomBytes(32).toString("base64url");
    await db.authToken.create({
      data: {
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        purpose: "ACTIVATION",
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      },
    });
    console.log("\nSuper admin created. One-time activation link:");
    console.log(`${process.env.APP_URL ?? "http://localhost:3000"}/activate?token=${raw}\n`);
  } else {
    console.log("Super admin already exists — skipped.");
  }
}

main().finally(() => db.$disconnect());
