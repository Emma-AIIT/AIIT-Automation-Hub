/**
 * TypeScript interfaces and union types for the IT Support ticketing module.
 * Covers `SupportTicket`, `TicketAttachment`, and `TicketReply`, including
 * all status, priority, source, and email threading fields.
 */
export type TicketStatus = 'open' | 'in-progress' | 'resolved';

export type TicketPriority = 'high' | 'low' | null;

export type TicketSource = 'phone' | 'email' | 'manual' | 'walk-in';

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
  source: TicketSource;
  email_subject: string | null;
  email_cc: string | null;
  email_bcc: string | null;
  email_message_id: string | null;
  conversation_id: string | null;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  content_id: string | null;
  created_at: string;
}

export type TicketReplyDirection = 'inbound' | 'outbound';

export interface TicketReply {
  id: string;
  ticket_id: string;
  direction: TicketReplyDirection;
  body: string;
  body_plain: string | null;
  from_email: string | null;
  to_email: string | null;
  cc: string | null;
  subject: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  sent_by: string | null;
  created_at: string;
}
