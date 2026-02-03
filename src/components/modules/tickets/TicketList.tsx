'use client';

import { type FC } from 'react';
import { format, differenceInDays } from 'date-fns';
import type { SupportTicket } from '@/types/tickets';

interface TicketListProps {
  tickets: SupportTicket[];
  loading: boolean;
  onTicketClick: (id: string) => void;
}

const getOpenAgeBorderColor = (createdAt: string) => {
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days <= 1) return 'border-l-4 border-l-emerald-500';
  if (days <= 3) return 'border-l-4 border-l-orange-500';
  return 'border-l-4 border-l-red-500';
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-[var(--color-accent-light)] text-[var(--color-brand-orange)]';
    case 'in-progress': return 'bg-amber-50 text-amber-700';
    case 'resolved': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const TicketList: FC<TicketListProps> = ({ tickets, loading, onTicketClick }) => {
  if (loading) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading tickets...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-muted)]">No tickets found</p>
        <p className="text-xs text-[var(--color-text-faint)] mt-1">Tickets will appear here when created via VAPI or the webhook API</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Created</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Caller</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Business</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Inquiry</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Assigned To</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => onTicketClick(ticket.id)}
              className={`border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${
                ticket.status === 'open' ? getOpenAgeBorderColor(ticket.created_at) : ''
              }`}
            >
              <td className="py-3 px-4 text-sm text-[var(--color-text-primary)]">
                {format(new Date(ticket.created_at), 'dd MMM yyyy, h:mm a')}
              </td>
              <td className="py-3 px-4 text-sm font-medium text-[var(--color-text-primary)]">
                {ticket.caller_name}
              </td>
              <td className="py-3 px-4 text-sm text-[var(--color-text-muted)]">
                {ticket.caller_business ?? '-'}
              </td>
              <td className="py-3 px-4 text-sm text-[var(--color-text-primary)] max-w-xs truncate">
                {ticket.inquiry}
              </td>
              <td className="py-3 px-4 text-sm text-[var(--color-text-muted)]">
                {ticket.assigned_to ?? '-'}
              </td>
              <td className="py-3 px-4">
                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(ticket.status)}`}>
                  {ticket.status.replace('-', ' ')}
                </span>
              </td>
              <td className="py-3 px-4">
                <button className="text-sm text-[var(--color-brand-orange)] hover:underline font-medium">
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
