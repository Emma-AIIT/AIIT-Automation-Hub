/**
 * StatsCard - Reusable metric card used across module dashboards.
 * Displays a title, primary value, optional subtitle, icon, and an optional trend
 * indicator (value + positive/negative direction) in a dark-themed card layout.
 */
interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
}

export function StatsCard({ title, value, subtitle, icon, trend }: StatsCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:-translate-y-px hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-semibold ${trend.positive ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend.value}
          </span>
        )}
      </div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-900 tracking-tight">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}
