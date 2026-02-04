export type TicketStatus = 'open' | 'in-progress' | 'resolved';

export type TicketPriority = 'high' | 'low' | null;

export interface SupportTicket {
  id: string;
  caller_name: string;
  caller_phone: string | null;
  caller_email: string | null;
  caller_business: string | null;
  inquiry: string;
  summary: string | null;
  status: TicketStatus;
  assigned_to: string | null;
  vapi_call_id: string | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  priority: TicketPriority;
  priority_reason: string | null;
}
