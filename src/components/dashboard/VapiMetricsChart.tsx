/**
 * VapiMetricsChart
 * Renders two side-by-side Recharts AreaCharts showing daily VAPI voice-call volume
 * and cumulative cost over a given period, along with period totals for each metric.
 */
'use client';

import { type FC } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DailyMetric {
  date: string;
  calls: number;
  cost: number;
}

interface VapiMetricsChartProps {
  metrics: DailyMetric[];
  totalCalls: number;
  totalCost: number;
}

function formatDateTick(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}-${parts[1]}-${parts[2]?.slice(0, 2)}`;
}

interface CallsTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CallsTooltip({ active, payload, label }: CallsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <p style={{ color: '#6c757d', fontSize: 11, margin: 0 }}>{label}</p>
      <p style={{ color: '#d4920a', fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>
        {payload[0]?.value} calls
      </p>
    </div>
  );
}

function CostTooltip({ active, payload, label }: CallsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <p style={{ color: '#6c757d', fontSize: 11, margin: 0 }}>{label}</p>
      <p style={{ color: '#7c6ce0', fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>
        ${payload[0]?.value?.toFixed(2)}
      </p>
    </div>
  );
}

export const VapiMetricsChart: FC<VapiMetricsChartProps> = ({ metrics, totalCalls, totalCost }) => {
  const formatCost = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {/* Number of Calls */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[var(--color-border-subtle)]">
        <div className="p-5 pb-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Number of Calls</p>
          <p className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">{totalCalls}</p>
        </div>
        <div className="w-full" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8a838" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#e8a838" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fill: '#6c757d', fontSize: 10 }}
                axisLine={{ stroke: '#e9ecef' }}
                tickLine={false}
                interval={Math.max(0, Math.floor(metrics.length / 4) - 1)}
              />
              <YAxis
                tick={{ fill: '#6c757d', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CallsTooltip />} cursor={{ stroke: 'rgba(232, 168, 56, 0.25)' }} />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="#e8a838"
                strokeWidth={2}
                fill="url(#callGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total Spent */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[var(--color-border-subtle)]">
        <div className="p-5 pb-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Total Spent</p>
          <p className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">{formatCost(totalCost)}</p>
        </div>
        <div className="w-full" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b7cf6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#8b7cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fill: '#6c757d', fontSize: 10 }}
                axisLine={{ stroke: '#e9ecef' }}
                tickLine={false}
                interval={Math.max(0, Math.floor(metrics.length / 4) - 1)}
              />
              <YAxis
                tick={{ fill: '#6c757d', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(v >= 1 ? 0 : 2)}`}
              />
              <Tooltip content={<CostTooltip />} cursor={{ stroke: 'rgba(139, 124, 246, 0.25)' }} />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#8b7cf6"
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
