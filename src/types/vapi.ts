/**
 * TypeScript interfaces for the VAPI voice-agent integration.
 * Defines `VapiAssistant`, `VapiCall` (with cost breakdown, transcript, and analysis),
 * and `AgentConfig` used to configure inbound/outbound phone agents.
 */
export interface VapiAssistant {
  id: string;
  name: string;
  model: {
    provider: string;
    model: string;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface VapiPhoneNumber {
  id: string;
  number?: string;
  name?: string;
  provider?: string;
}

export interface VapiCall {
  id: string;
  orgId: string;
  assistantId: string;
  customer: {
    number: string;
    name?: string;
  };
  phoneNumber: {
    number: string;
  };
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'ended' | 'failed' | 'busy' | 'no-answer';
  endedReason?: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  startedAt: string;
  endedAt: string | null;
  cost: number;
  costBreakdown: {
    transport: number;
    stt: number;
    llm: number;
    tts: number;
    vapi: number;
  };
  messages: Array<{
    role: string;
    content?: string;
    message?: string;
    time?: number;
  }>;
  recordingUrl?: string;
  transcript?: string;
  analysis?: {
    summary?: string;
    successEvaluation?: string;
    structuredData?: Record<string, unknown>;
  };
  artifact?: {
    messagesOpenAIFormatted: Array<{
      role: string;
      content: string;
    }>;
    recordingUrl: string;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  phoneNumber: string;
  assistantId: string;
  type: 'inbound' | 'outbound' | 'both';
  description: string;
}
