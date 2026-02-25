import { NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;
  const seen = new Set<string>();
  const phones: string[] = [];

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from("whatsapp_group_participants")
      .select("participant_phone")
      .like("participant_id", "%@c.us")
      .not("participant_phone", "is", null)
      .order("participant_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as { participant_phone: string | null }[];
    for (const r of list) {
      const phone = r.participant_phone?.trim();
      if (phone && !seen.has(phone)) {
        seen.add(phone);
        phones.push(phone);
      }
    }

    hasMore = list.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  phones.sort((a, b) => a.localeCompare(b));

  const today = new Date().toISOString().slice(0, 10);
  const filename = `whatsapp-contacts-${today}.txt`;

  return new NextResponse(phones.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
