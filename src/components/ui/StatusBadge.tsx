/**
 * StatusBadge (ui) - Pill badge for debt-recovery client statuses.
 * Accepts a status of current | warning | critical | suspended and renders it with
 * the appropriate color, label, and optional size variant (sm | md).
 */
import { type FC } from 'react';

type Status = 'current' | 'warning' | 'critical' | 'suspended';

interface StatusBadgeProps {
  status: Status;
  size?: 'sm' | 'md';
}

const statusConfig = {
  current: {
    label: 'Current',
    dotColor: 'bg-emerald-500',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
  },
  warning: {
    label: 'Warning',
    dotColor: 'bg-amber-500',
    className: 'bg-amber-50 text-amber-700 border-amber-200/50',
  },
  critical: {
    label: 'Critical',
    dotColor: 'bg-rose-500',
    className: 'bg-rose-50 text-rose-700 border-rose-200/50',
  },
  suspended: {
    label: 'Suspended',
    dotColor: 'bg-gray-400',
    className: 'bg-gray-100 text-gray-600 border-gray-200/50',
  },
};

export const StatusBadge: FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status];

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg font-medium border ${sizeClasses} ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </span>
  );
};
