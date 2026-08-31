/**
 * Failure alert emails for WhatsApp automations.
 * Posts to the existing Make.com send-email scenario (MAKE_SEND_EMAIL_WEBHOOK_URL,
 * same one the tickets module uses). Defaults to WHATSAPP_ALERT_EMAIL; pass
 * `to` to send somewhere else, as the outbound-call lead summaries do.
 * Best-effort: never throws — a broken alert channel must not break the send path.
 * SERVER-SIDE ONLY.
 */
import { env } from "~/env";

export async function sendAlertEmail(subject: string, body: string, recipient?: string): Promise<void> {
  const webhookUrl = env.MAKE_SEND_EMAIL_WEBHOOK_URL;
  const to = recipient ?? env.WHATSAPP_ALERT_EMAIL;
  if (!webhookUrl || !to) {
    console.warn("[alerts] Skipping alert email (MAKE_SEND_EMAIL_WEBHOOK_URL or WHATSAPP_ALERT_EMAIL not set):", subject);
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        body: body.replace(/\n/g, "<br>"),
        body_plain: body,
      }),
    });
    if (!res.ok) {
      console.error("[alerts] Alert email webhook returned", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[alerts] Failed to send alert email:", err);
  }
}
