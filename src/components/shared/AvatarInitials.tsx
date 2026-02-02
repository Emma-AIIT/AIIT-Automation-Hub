const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-purple-100 text-purple-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function AvatarInitials({ name, className = '' }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const colorClass = COLORS[hashString(name) % COLORS.length]!;

  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 ${colorClass} ${className}`}>
      {initials}
    </div>
  );
}
