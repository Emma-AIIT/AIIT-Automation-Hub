/**
 * GET /api/whatsapp/download-phones?accountId=<id>
 * Called directly by the browser (anchor download link) from the Participants page.
 * Paginates through whatsapp_group_participants for the given account, deduplicates
 * phone numbers (only @c.us contacts with a non-null phone), sorts them, and returns
 * a plain-text file for download named whatsapp-contacts-{accountId}-{date}.txt.
 * No auth required — access is limited by knowing the URL.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";

const VALID_ACCOUNT_IDS: WhatsAppAccountId[] = ['aiit-automation', 'susu-closets', 'gim-foundation', 'aiit-business'];

export async function GET(req: NextRequest) {
  const accountIdRaw = req.nextUrl.searchParams.get('accountId');

  if (!accountIdRaw || !VALID_ACCOUNT_IDS.includes(accountIdRaw as WhatsAppAccountId)) {
    return NextResponse.json({ error: 'Valid accountId is required' }, { status: 400 });
  }

  const accountId = accountIdRaw as WhatsAppAccountId;
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
      .eq("account_id", accountId)
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
  const filename = `whatsapp-contacts-${accountId}-${today}.txt`;

  return new NextResponse(phones.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
