import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: due, error: fetchError } = await supabase
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const webhookUrl = process.env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL not configured" }, { status: 500 });
  }

  for (const msg of due) {
    const groupIds = msg.group_ids as string[];

    const results = await Promise.allSettled(
      groupIds.map((chatId: string) =>
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg.message }),
        })
      )
    );

    const allOk = results.every((r) => r.status === "fulfilled");

    await supabase
      .from("scheduled_messages")
      .update({
        status: allOk ? "sent" : "failed",
        sent_at: new Date().toISOString(),
        error: allOk ? null : "One or more groups failed to receive the message",
      })
      .eq("id", msg.id);
  }

  return NextResponse.json({ processed: due.length });
}
