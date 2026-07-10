import { z } from "zod";

// z.coerce.boolean() runs JS `Boolean(value)`, so the literal string "false"
// coerces to true — a real footgun for env vars, where everything is a
// string. Parse the actual text instead.
const booleanEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : v.toLowerCase() === "true"));

const Env = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().default("hilcoe_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  ACTIVATION_TOKEN_TTL_HOURS: z.coerce.number().default(72),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: booleanEnv(false),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  MAIL_FROM: z.string(),
  SOLVER_URL: z.string().url().default("http://localhost:8000"),
  // Checked by the solver on every request — "internal-only" was previously
  // just a deployment convention (a comment in the Dockerfile), not something
  // enforced in code. Must match the solver process's own env var of the
  // same name.
  SOLVER_SHARED_SECRET: z.string().min(32, "SOLVER_SHARED_SECRET must be at least 32 characters"),
  // Keys the AuditLog hash chain (HMAC-SHA256) so tampering requires this key,
  // not just database write access. Keep it out of the database/backups.
  AUDIT_HMAC_KEY: z.string().min(32, "AUDIT_HMAC_KEY must be at least 32 characters"),
  // Only honor X-Forwarded-For when the app is actually deployed behind a
  // trusted reverse proxy that appends (not just forwards) the real client
  // IP. Without a trusted proxy in front, this header is entirely
  // client-supplied and trivially spoofable — see lib/auth/client-ip.ts.
  TRUST_PROXY: booleanEnv(false),
});

// Fail fast at boot with a readable message instead of deep runtime errors.
export const env = Env.parse(process.env);
