import nodemailer from "nodemailer";
import { env } from "@/lib/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE, // true for 465, false for 587/STARTTLS
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendMail(opts: { to: string; subject: string; html: string; text: string; bcc?: string[] }) {
  return transporter.sendMail({ from: env.MAIL_FROM, ...opts });
}

export const verifySmtp = () => transporter.verify();
