#!/usr/bin/env node
/**
 * Reads a CSV of WhatsApp group participants and prints SQL INSERT statements
 * for public.whatsapp_group_participants (upsert).
 *
 * CSV columns: Group Chat, Participant ID, Name, Partipant Number, Group Chat ID
 * (Group Chat may contain commas; we parse from the end.)
 *
 * Usage:
 *   node scripts/csv-to-participants-sql.js path/to/participants.csv
 *   node scripts/csv-to-participants-sql.js path/to/participants.csv > seed-participants.sql
 *
 * Output is batched so each INSERT is small enough for Supabase SQL Editor.
 * Run each statement in order, or run the whole file via: psql $DATABASE_URL -f script.sql
 */

const BATCH_SIZE = 400;

import fs from "fs";
import path from "path";

/**
 * @param {string} line
 */
function parseCsvLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",");
  if (parts.length < 5) return null;
  const group_chat_id = (parts[parts.length - 1] ?? "").trim();
  const participant_phone = (parts[parts.length - 2] ?? "").trim();
  const participant_name = (parts[parts.length - 3] ?? "").trim();
  const participant_id = (parts[parts.length - 4] ?? "").trim();
  const group_chat_name = parts.slice(0, parts.length - 4).join(",").trim();
  return { group_chat_id, group_chat_name, participant_id, participant_phone, participant_name };
}

/**
 * @param {string | null | undefined} str
 */
function escapeSql(str) {
  if (str == null || str === "") return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node csv-to-participants-sql.js <path-to-csv>");
    process.exit(1);
  }
  const absPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    console.error("File not found:", absPath);
    process.exit(1);
  }
  const text = fs.readFileSync(absPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("CSV has no data rows");
    process.exit(1);
  }
  const dataLines = lines.slice(1);
  const rows = [];
  for (const line of dataLines) {
    const row = parseCsvLine(line);
    if (!row?.group_chat_id || !row?.participant_id) continue;
    rows.push(row);
  }
  if (rows.length === 0) {
    console.error("No valid participant rows found");
    process.exit(1);
  }
  console.log(
    "-- Generated from",
    path.basename(absPath),
    "(" + rows.length + " rows in batches of " + BATCH_SIZE + "). Run each INSERT in order in SQL Editor, or: psql $DATABASE_URL -f this-file\n"
  );
  const insertHeader = `INSERT INTO public.whatsapp_group_participants (
  group_chat_id,
  group_chat_name,
  participant_id,
  participant_phone,
  participant_name
)
VALUES`;
  const insertSuffix = `
ON CONFLICT (group_chat_id, participant_id) DO UPDATE SET
  group_chat_name = EXCLUDED.group_chat_name,
  participant_phone = EXCLUDED.participant_phone,
  participant_name = EXCLUDED.participant_name;
`;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch
      .map(
        (r) =>
          `  (${escapeSql(r.group_chat_id)}, ${escapeSql(r.group_chat_name)}, ${escapeSql(r.participant_id)}, ${escapeSql(r.participant_phone)}, ${r.participant_name ? escapeSql(r.participant_name) : "NULL"})`
      )
      .join(",\n");
    console.log("-- Batch " + (Math.floor(i / BATCH_SIZE) + 1) + " (rows " + (i + 1) + "-" + (i + batch.length) + ")");
    console.log(insertHeader + "\n" + values + insertSuffix);
    if (i + BATCH_SIZE < rows.length) console.log("");
  }
}

main();
