import { Resend } from "resend";
import { env } from "../env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface RegistrationEmailInput {
  to: string;
  name: string;
  eventTitle: string;
  eventStartsAt: string;
  eventLocation: string | null;
  isVirtual: boolean;
  txId: string | null;
  qrPngDataUrl: string | null;
  confirmationUrl: string;
}

/**
 * Send a registration confirmation email.
 *
 * If `RESEND_API_KEY` is not configured, this falls back to a console log so
 * local dev "just works" without third-party signup.
 */
export async function sendRegistrationEmail(input: RegistrationEmailInput): Promise<void> {
  const subject = `You're in — ${input.eventTitle}`;

  if (!resend || !env.EMAIL_FROM) {
    // eslint-disable-next-line no-console
    console.log(
      `[email:fallback] would send "${subject}" to ${input.to}\n` +
        `  event: ${input.eventTitle}\n` +
        `  starts: ${input.eventStartsAt}\n` +
        `  txid:   ${input.txId ?? "(none)"}\n` +
        `  link:   ${input.confirmationUrl}`,
    );
    return;
  }

  const html = renderHtml(input);

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject,
    html,
  });
}

function renderHtml(input: RegistrationEmailInput): string {
  // Inline-styled HTML so it survives email clients. Brand colors only.
  const navy = "#1B1EA9";
  const blue = "#003FFF";
  const cyan = "#00E6FF";
  const soft = "#2D2D31";

  const where = input.isVirtual ? "Online" : input.eventLocation ?? "TBA";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#EFF0F7;font-family:'Helvetica Neue',Arial,sans-serif;color:${soft};">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF0F7;padding:32px 16px;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #DAE3FF;">
          <tr><td style="background:linear-gradient(135deg,${navy},${blue});padding:32px;color:#fff;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">BE on BSV</div>
            <div style="font-size:24px;font-weight:700;margin-top:8px;">You're in.</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(input.name)},</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
              You're confirmed for <strong>${escapeHtml(input.eventTitle)}</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
              <tr>
                <td style="padding:8px 0;color:${navy};font-weight:600;width:80px;">When</td>
                <td style="padding:8px 0;">${escapeHtml(formatDate(input.eventStartsAt))}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:${navy};font-weight:600;">Where</td>
                <td style="padding:8px 0;">${escapeHtml(where)}</td>
              </tr>
              ${
                input.txId
                  ? `<tr>
                       <td style="padding:8px 0;color:${navy};font-weight:600;">Ticket</td>
                       <td style="padding:8px 0;font-family:monospace;font-size:12px;word-break:break-all;color:${blue};">${escapeHtml(input.txId)}</td>
                     </tr>`
                  : ""
              }
            </table>
            ${
              input.qrPngDataUrl
                ? `<div style="text-align:center;margin:24px 0;">
                     <img src="${input.qrPngDataUrl}" alt="Your ticket QR" width="180" height="180" style="display:inline-block;border:8px solid #fff;border-radius:12px;background:#fff;" />
                     <div style="font-size:12px;color:${soft};opacity:0.7;margin-top:8px;">Show this QR at the event.</div>
                   </div>`
                : ""
            }
            <div style="text-align:center;margin:32px 0 8px;">
              <a href="${input.confirmationUrl}" style="display:inline-block;background:${blue};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;">View your ticket</a>
            </div>
            <p style="margin:32px 0 0;font-size:12px;color:#6b6b75;text-align:center;">
              Together <span style="color:${cyan};">▶</span> Towards Better
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
