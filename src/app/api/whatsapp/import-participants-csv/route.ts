import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { env } from "~/env";

/** Selected groups are read from Supabase (whatsapp_dashboard_groups). Seed via scripts/seed-whatsapp-dashboard-groups.sql */

const MAX_CSV_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Parse a CSV line where the first column (Group Chat) may contain commas.
 * Columns: Group Chat, Participant ID, Name, Partipant Number, Group Chat ID
 */
function parseCsvLine(line: string): { group_chat_name: string; participant_id: string; participant_name: string; participant_phone: string; group_chat_id: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  if (parts.length < 5) return null;
  const group_chat_id = parts[parts.length - 1]!.trim();
  const participant_phone = parts[parts.length - 2]!.trim();
  const participant_name = (parts[parts.length - 3] ?? "").trim();
  const participant_id = parts[parts.length - 4]!.trim();
  const group_chat_name = parts.slice(0, parts.length - 4).join(",").trim();
  return { group_chat_name, participant_id, participant_name, participant_phone, group_chat_id };
}

export async function POST(req: NextRequest) {
  try {
    const secret = env.WHATSAPP_IMPORT_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Import not configured (set WHATSAPP_IMPORT_SECRET)" }, { status: 503 });
    }
    const headerSecret = req.headers.get("x-import-secret");
    if (headerSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file (form field 'file')" }, { status: 400 });
    }
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    const supabase = createAdminClient();

    // Which groups count as "selected" comes from the DB (seed via scripts/seed-whatsapp-dashboard-groups.sql)
    const { data: dashboardRows, error: dashboardError } = await supabase
      .from("whatsapp_dashboard_groups")
      .select("group_id");
    if (dashboardError) {
      return NextResponse.json({ error: dashboardError.message }, { status: 500 });
    }
    const selectedGroupIds = new Set((dashboardRows ?? []).map((r) => r.group_id));
    if (selectedGroupIds.size === 0) {
      return NextResponse.json(
        { error: "No dashboard groups in database. Run scripts/seed-whatsapp-dashboard-groups.sql first." },
        { status: 400 }
      );
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    // Skip header (first line); only import rows whose group_chat_id is in whatsapp_dashboard_groups
    const dataLines = lines.slice(1);
    const participants: { group_chat_id: string; group_chat_name: string; participant_id: string; participant_phone: string; participant_name: string | null }[] = [];
    for (const line of dataLines) {
      const row = parseCsvLine(line);
      if (!row?.group_chat_id || !row?.participant_id) continue;
      if (!selectedGroupIds.has(row.group_chat_id)) continue;
      participants.push({
        group_chat_id: row.group_chat_id,
        group_chat_name: row.group_chat_name,
        participant_id: row.participant_id,
        participant_phone: (row.participant_phone || row.participant_id.replace(/@c\.us$/, "")) ?? "",
        participant_name: row.participant_name || null,
      });
    }

    // Upsert participants (only for groups that exist in whatsapp_dashboard_groups)
    let inserted = 0;
    const BATCH = 100;
    for (let i = 0; i < participants.length; i += BATCH) {
      const batch = participants.slice(i, i + BATCH);
      const { error } = await supabase.from("whatsapp_group_participants").upsert(
        batch.map((p) => ({
          group_chat_id: p.group_chat_id,
          group_chat_name: p.group_chat_name,
          participant_id: p.participant_id,
          participant_phone: p.participant_phone,
          participant_name: p.participant_name,
        })),
        { onConflict: "group_chat_id,participant_id" }
      );
      if (error) {
        console.error("[import-participants-csv] Supabase upsert error:", error);
        return NextResponse.json({ error: error.message, inserted }, { status: 500 });
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      dashboardGroupsUsed: selectedGroupIds.size,
      participantsImported: inserted,
      rowsSkippedNotSelected: dataLines.length - participants.length,
    });
  } catch (e) {
    console.error("[import-participants-csv]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
  }
}
