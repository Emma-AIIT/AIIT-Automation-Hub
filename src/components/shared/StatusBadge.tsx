/**
 * StatusBadge (shared) - Inline badge for quote pipeline statuses.
 * Maps quote status strings (Pre sales, Quote, Won, Lost, etc.) to color-coded pill
 * badges; also exports a QuoteSourceBadge for rendering the lead source of a quote.
 */
import type { Quote } from '@/lib/mock-data/quotes';

/** Status colors: Pre sales (yellow), Quote (green), Lost (blue), Won (purple) */
const statusStyles: Record<string, string> = {
  'Pre sales': 'bg-amber-100 text-amber-800',
  Quote: 'bg-emerald-100 text-emerald-800',
  Lost: 'bg-red-100 text-red-800',
  Won: 'bg-violet-100 text-violet-800',
  Pending: 'bg-amber-100 text-amber-800',
  'Number Missing': 'bg-gray-100 text-gray-700',
};

export function StatusBadge({ status }: { status: Quote['status'] }) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}
