/**
 * voice-agents config
 *
 * Defines the 5 VAPI voice agents deployed for All In IT Solutions.
 * Each agent has a dedicated phone number and VAPI assistantId.
 *
 * To add a new agent:
 *   1. Create the assistant in the VAPI dashboard
 *   2. Add an entry here with its assistantId and phone number
 *   3. The agent will automatically appear on the Voice Agents page
 *
 * Types:
 *   - inbound:  answers incoming calls to the phone number
 *   - outbound: makes outgoing calls (e.g. debt collection, lead follow-up)
 */
import type { AgentConfig } from '@/types/vapi';

/** Shared voice agent config used by the dashboard AgentStatusCards and Voice Agents page */
export const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'office', name: 'Office Receptionist', phoneNumber: '+61 440 132 789', assistantId: '3f46f45a-7729-4e48-b723-f41aa99ed700', type: 'inbound', description: 'Office receptionist and support' },
  { id: 'dc', name: 'DC Assistant', phoneNumber: '+61 489 264 277', assistantId: '9ed496a5-e9ad-4e2c-9c9d-62b7e5ad1330', type: 'outbound', description: 'Debt collection follow-ups' },
  { id: 'test', name: 'Test Assistant', phoneNumber: '+61 483 929 499', assistantId: 'a29660a1-ac97-46de-a0de-6f153de81789', type: 'inbound', description: 'Calling all other agents to check if they are active' },
  { id: 'ea', name: 'Exec Assistant', phoneNumber: '+61 440 138 322', assistantId: 'a6afcb05-c34d-4f9d-858d-14bff838bb1f', type: 'inbound', description: 'Executive assistant for scheduling and inquiries' },
  { id: 'ali-ai', name: 'alitaufeek.com Ali AI 2.0', phoneNumber: '+61 440 138 322', assistantId: '0e1bcd6f-8476-4f6d-88b7-00f929ef485f', type: 'outbound', description: 'Calls new leads from alitaufeek.com form submissions to engage and gather info' },
];
