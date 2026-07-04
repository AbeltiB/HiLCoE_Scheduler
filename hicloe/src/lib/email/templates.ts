import { env } from "@/lib/env";
import { sendMail } from "@/lib/email/mailer";

const shell = (title: string, body: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="font-weight:600;font-size:18px;margin:0 0 4px">HiLCoE Scheduler</h2>
    <p style="color:#666;font-size:13px;margin:0 0 20px">${title}</p>
    ${body}
    <p style="color:#999;font-size:12px;margin-top:28px">
      If you didn't expect this email, you can ignore it. This link can only be used once.
    </p>
  </div>`;

export async function sendActivationEmail(to: string, fullName: string, rawToken: string) {
  const url = `${env.APP_URL}/activate?token=${rawToken}`;
  const hours = env.ACTIVATION_TOKEN_TTL_HOURS;
  await sendMail({
    to,
    subject: "Activate your HiLCoE Scheduler account",
    text: `Hello ${fullName},\n\nAn account has been registered for you on the HiLCoE Scheduler. Set your password to activate it:\n${url}\n\nThe link expires in ${hours} hours.`,
    html: shell(
      "Account activation",
      `<p style="font-size:14px">Hello ${fullName},</p>
       <p style="font-size:14px">An account has been registered for you. Set your password to activate it. The link expires in ${hours} hours.</p>
       <p style="margin:24px 0"><a href="${url}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">Set password &amp; activate</a></p>
       <p style="font-size:12px;color:#666">Or copy this link: ${url}</p>`
    ),
  });
}
