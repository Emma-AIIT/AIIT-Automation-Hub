/**
 * Phone number parsing for bulk WhatsApp sends to individual numbers.
 *
 * Takes free text (typed, pasted, or a CSV/Excel cell) and returns E.164 numbers,
 * which is the format WaSender expects. Bare numbers are read as Australian. Pure
 * logic with no imports, so it runs in the browser and in node:test.
 */

export type ParsedNumbers = {
  /** Valid numbers in E.164 (+61412345678), first occurrence order, no duplicates. */
  numbers: string[];
  /** Entries that could not be read as a phone number, as typed. */
  invalid: string[];
  /** How many repeats of an already listed number were dropped. */
  duplicates: number;
};

/** One entry to E.164, or null when it is not a usable phone number. */
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Excel can hand a number back as text with a trailing ".0"
  const cleaned = trimmed.replace(/\.0$/, '').replace(/[\s().-]/g, '');

  let digits: string;
  if (cleaned.startsWith('+')) digits = cleaned.slice(1);
  else if (cleaned.startsWith('00')) digits = cleaned.slice(2);
  else if (/^0[2-578]\d{8}$/.test(cleaned)) digits = `61${cleaned.slice(1)}`; // 0412 345 678
  else if (/^4\d{8}$/.test(cleaned)) digits = `61${cleaned}`; // Excel dropped the leading 0
  else digits = cleaned;

  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/** Reads every number out of free text, split on new lines, commas, semicolons or tabs. */
export function parsePhoneNumbers(text: string): ParsedNumbers {
  const seen = new Set<string>();
  const invalid: string[] = [];
  let duplicates = 0;

  for (const entry of text.split(/[\n\r,;\t]+/)) {
    if (!entry.trim()) continue;
    const number = normalizePhoneNumber(entry);
    if (!number) invalid.push(entry.trim());
    else if (seen.has(number)) duplicates++;
    else seen.add(number);
  }

  return { numbers: [...seen], invalid, duplicates };
}

/**
 * Finds the numbers in spreadsheet rows. Uses the first column where most filled
 * cells are phone numbers, so names, notes and a header row are skipped rather than
 * reported as invalid.
 */
export function numbersFromRows(rows: string[][]): ParsedNumbers {
  const width = Math.max(0, ...rows.map((r) => r.length));

  for (let col = 0; col < width; col++) {
    const cells = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    const valid = cells.filter((c) => normalizePhoneNumber(c) !== null);
    if (valid.length > 0 && valid.length >= cells.length / 2) {
      const parsed = parsePhoneNumbers(cells.join('\n'));
      // A header such as "Phone" in that column is not a bad number
      const header = cells[0]!;
      const invalid = /\d/.test(header) ? parsed.invalid : parsed.invalid.filter((e) => e !== header);
      return { ...parsed, invalid };
    }
  }

  return { numbers: [], invalid: [], duplicates: 0 };
}
