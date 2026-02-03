/**
 * Deterministic color assignment for workers/employees.
 * Uses a hash of the name to pick from a palette that matches the dashboard theme.
 */

const WORKER_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-200' },
] as const;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const GREEN = { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' };

export function getWorkerColor(workerName: string) {
  if (!workerName?.trim()) return null;
  const name = workerName.trim().toLowerCase();
  if (name === 'yayha' || name === 'yahya') return GREEN;
  const idx = hashString(workerName.trim()) % WORKER_COLORS.length;
  return WORKER_COLORS[idx];
}
