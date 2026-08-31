/**
 * Australian phone number parsing for the Outbound Calls module.
 *
 * Ali pastes numbers however they arrive: from a spreadsheet, an email, a text
 * message. This accepts that mess (newlines, commas, semicolons, spaces,
 * brackets, hyphens, a leading 0 or 61 or +61) and returns strict E.164, which
 * is the only shape VAPI accepts.
 */

/** A single parsed entry, keeping the raw text so the UI can show what failed. */
export type ParsedNumber = {
  raw: string;
  e164: string | null;
  reason?: string;
};

/**
 * Normalises one Australian number to E.164 (+61...).
 * Returns null when the input cannot be a valid AU mobile or landline.
 */
export function normaliseAuNumber(input: string): { e164: string | null; reason?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { e164: null, reason: 'empty' };

  // Strip everything a human might type around the digits.
  let digits = trimmed.replace(/[\s()\-.]/g, '');

  const hadPlus = digits.startsWith('+');
  if (hadPlus) digits = digits.slice(1);

  if (!/^\d+$/.test(digits)) {
    return { e164: null, reason: 'contains non-digits' };
  }

  // Already international AU
  if (digits.startsWith('61')) {
    const national = digits.slice(2);
    if (national.length !== 9) return { e164: null, reason: 'wrong length for +61' };
    return { e164: `+61${national}` };
  }

  // A non-AU country code, only trust it when the caller typed the +
  if (hadPlus) {
    if (digits.length < 8 || digits.length > 15) return { e164: null, reason: 'invalid length' };
    return { e164: `+${digits}` };
  }

  // National format: 0412345678 or 0298765432
  if (digits.startsWith('0')) {
    const national = digits.slice(1);
    if (national.length !== 9) return { e164: null, reason: 'wrong length for an AU number' };
    return { e164: `+61${national}` };
  }

  // Bare 9-digit AU number with the trunk 0 already dropped
  if (digits.length === 9) return { e164: `+61${digits}` };

  return { e164: null, reason: 'not recognisable as an AU number' };
}

/**
 * Splits a pasted blob into individual numbers, normalises each, and drops
 * duplicates (keeping first occurrence) so nobody gets dialled twice in one batch.
 */
export function parseNumberList(blob: string): {
  valid: ParsedNumber[];
  invalid: ParsedNumber[];
  duplicates: number;
} {
  const parts = blob
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const valid: ParsedNumber[] = [];
  const invalid: ParsedNumber[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const raw of parts) {
    const { e164, reason } = normaliseAuNumber(raw);
    if (!e164) {
      invalid.push({ raw, e164: null, reason });
      continue;
    }
    if (seen.has(e164)) {
      duplicates++;
      continue;
    }
    seen.add(e164);
    valid.push({ raw, e164 });
  }

  return { valid, invalid, duplicates };
}

/** Pretty AU display, e.g. +61412345678 -> 0412 345 678 */
export function formatAuNumber(e164: string): string {
  const m = /^\+61(\d{9})$/.exec(e164);
  if (!m?.[1]) return e164;
  const n = m[1];
  return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
