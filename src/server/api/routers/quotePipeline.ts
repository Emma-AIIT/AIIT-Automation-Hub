import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { env } from "~/env";
import { MOCK_QUOTES } from "@/lib/mock-data/quotes";
import type { Quote } from "@/lib/mock-data/quotes";

/** Sheet column indices (0-based) */
const COL = {
  BUSINESS_NAME: 0,
  NAME: 1,
  EMAIL: 2,
  PHONE: 3,
  FILE: 4,
  DATE: 5,
  TRIGGER: 6,
  SOURCE: 7,
  VALUE: 8,
  STATUS: 9,
  DROPBOX_PATH: 10,
} as const;

type SheetRow = Record<string, string | number | undefined>;

function getCell(row: SheetRow, index: number): string | null {
  const val = row[String(index)] ?? row[index];
  if (val == null || val === "") return null;
  return String(val).trim() || null;
}

function parseDatePart(fullDate: string | null): { date: string; time: string } {
  if (!fullDate) return { date: "", time: "" };
  // Sheet format: "DD-MM-YYYY hh:mm A" or "23-09-2025 10:32 AM"
  const parts = fullDate.trim().split(/\s+/);
  const datePart = parts[0] ?? "";
  const timePart = parts.slice(1).join(" ") ?? "";
  return { date: datePart, time: timePart };
}

function mapSheetRowToQuote(row: SheetRow, rowNumber: number): Quote {
  const datePart = parseDatePart(getCell(row, COL.DATE));
  const valueStr = getCell(row, COL.VALUE);
  const numValue = valueStr ? parseFloat(valueStr.replace(/[^0-9.-]/g, "")) : 0;
  const source = getCell(row, COL.SOURCE) as Quote["source"] | null;
  const status = getCell(row, COL.STATUS) as Quote["status"] | null;

  return {
    id: rowNumber,
    businessName: getCell(row, COL.BUSINESS_NAME) ?? "",
    company: null,
    contactName: getCell(row, COL.NAME),
    email: getCell(row, COL.EMAIL),
    phone: getCell(row, COL.PHONE),
    value: Number.isNaN(numValue) ? 0 : numValue,
    date: datePart.date,
    time: datePart.time,
    source: source && ["Email", "SMS", "Website"].includes(source) ? source : "Email",
    status: status && ["Won", "Quote", "Lost", "Pending", "Pre sales", "Number Missing"].includes(status)
      ? status
      : "Quote",
    trigger: getCell(row, COL.TRIGGER),
    file: getCell(row, COL.FILE),
    dropboxFilePath: getCell(row, COL.DROPBOX_PATH),
    rowNumber,
  };
}

export const quotePipelineRouter = createTRPCRouter({
  getRows: publicProcedure.query(async (): Promise<{
    quotes: Quote[];
    useMockData: boolean;
  }> => {
    const webhookUrl = env.MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL;

    if (!webhookUrl) {
      return {
        quotes: MOCK_QUOTES,
        useMockData: true,
      };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        console.error("Make.com Get Rows webhook failed:", response.status);
        return { quotes: MOCK_QUOTES, useMockData: true };
      }

      const data = (await response.json()) as
        | { rows?: SheetRow[]; bundles?: SheetRow[]; data?: SheetRow[] }
        | SheetRow[]
        | SheetRow;

      // Support multiple response shapes from Make.com
      let rawRows: SheetRow[];
      if (Array.isArray(data)) {
        rawRows = data;
      } else if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        ("0" in data || "__ROW_NUMBER__" in data)
      ) {
        // Single row object (Make.com returns first bundle when using {{2}})
        rawRows = [data as SheetRow];
      } else if (data && typeof data === "object" && !Array.isArray(data)) {
        rawRows = (data as { rows?: SheetRow[]; bundles?: SheetRow[]; data?: SheetRow[] }).rows ??
          (data as { bundles?: SheetRow[] }).bundles ??
          (data as { data?: SheetRow[] }).data ??
          [];
      } else {
        rawRows = [];
      }
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return { quotes: MOCK_QUOTES, useMockData: true };
      }

      const quotes: Quote[] = [];
      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i]!;
        const rowNum =
          (raw.__rowNumber as number) ??
          (raw.__ROW_NUMBER__ as number) ??
          i + 2;
        // Skip header row (row 1)
        if (rowNum === 1) continue;
        const businessName = getCell(raw, COL.BUSINESS_NAME);
        if (!businessName) continue; // Skip empty rows
        quotes.push(mapSheetRowToQuote(raw, rowNum));
      }

      return { quotes, useMockData: false };
    } catch (error) {
      console.error("Error fetching quote pipeline from Make.com:", error);
      return { quotes: MOCK_QUOTES, useMockData: true };
    }
  }),

  updateRow: publicProcedure
    .input(
      z.object({
        rowNumber: z.number().int().min(2),
        trigger: z.string().nullable().optional(),
        status: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const webhookUrl = env.MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL;

      if (!webhookUrl) {
        throw new Error(
          "MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL is not configured"
        );
      }

      const values: Record<number, string> = {};
      if (input.trigger !== undefined) {
        values[COL.TRIGGER] = input.trigger ?? "";
      }
      if (input.status !== undefined) {
        values[COL.STATUS] = input.status;
      }

      if (Object.keys(values).length === 0) {
        return { success: true };
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowNumber: input.rowNumber,
            values,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Make.com Update Row webhook returned status ${response.status}`
          );
        }

        return { success: true };
      } catch (error) {
        console.error("Error updating quote pipeline via Make.com:", error);
        throw new Error(
          error instanceof Error
            ? `Failed to update row: ${error.message}`
            : "Failed to update row"
        );
      }
    }),
});
