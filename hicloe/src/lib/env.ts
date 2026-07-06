import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().default("hilcoe_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  ACTIVATION_TOKEN_TTL_HOURS: z.coerce.number().default(72),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  MAIL_FROM: z.string(),
  SOLVER_URL: z.string().url().default("http://localhost:8000"),
});

// Fail fast at boot with a readable message instead of deep runtime errors.
export const env = Env.parse(process.env);
