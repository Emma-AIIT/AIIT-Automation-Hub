'use client';

import { type FC } from 'react';
import { api } from '@/trpc/react';
import { formatDistanceToNow } from 'date-fns';

interface CallDetailDrawerProps {
  callId: string;
  onClose: () => void;
}

export const CallDetailDrawer: FC<CallDetailDrawerProps> = ({ callId, onClose }) => {
  const { data: call, isLoading } = api.vapi.getCallById.useQuery({ callId });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[var(--color-border-subtle)] p-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--color-brand-navy)]">Call Details</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-muted)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-[var(--color-text-muted)]">Loading...</div>
        ) : !call ? (
          <div className="p-6 text-center text-[var(--color-text-muted)]">Call not found</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Call Info */}
            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Customer Number</p>
                  <p className="text-sm font-mono text-[var(--color-brand-navy)] mt-1">{call.customer?.number ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Status</p>
                  <p className="text-sm text-[var(--color-brand-navy)] mt-1">{call.status}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Started</p>
                  <p className="text-sm text-[var(--color-brand-navy)] mt-1">
                    {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Cost</p>
                  <p className="text-sm font-semibold text-[var(--color-brand-navy)] mt-1">${call.cost?.toFixed(3)}</p>
                </div>
              </div>
            </div>

            {/* Analysis */}
            {call.analysis && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)]">Analysis</h3>
                {call.analysis.summary && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Summary</p>
                    <div className="bg-gray-50 rounded-xl p-4 text-sm text-[var(--color-text-primary)]">
                      {call.analysis.summary}
                    </div>
                  </div>
                )}
                {call.analysis.successEvaluation && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Success Evaluation</p>
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                      call.analysis.successEvaluation.toLowerCase() === 'successful' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {call.analysis.successEvaluation}
                    </span>
                  </div>
                )}
                {call.analysis.structuredData && Object.keys(call.analysis.structuredData).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Data</p>
                    <div className="bg-gray-50 rounded-xl p-4 text-sm font-mono text-[var(--color-text-primary)] space-y-1">
                      {Object.entries(call.analysis.structuredData).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-[var(--color-text-muted)]">{key}:</span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recording */}
            {call.recordingUrl && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Recording</h3>
                <audio controls className="w-full">
                  <source src={call.recordingUrl} type="audio/mpeg" />
                </audio>
              </div>
            )}

            {/* Transcript */}
            {call.transcript && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Transcript</h3>
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                  {call.transcript}
                </div>
              </div>
            )}

            {/* Messages */}
            {((call.messages && call.messages.length > 0) || (call.artifact?.messagesOpenAIFormatted && call.artifact.messagesOpenAIFormatted.length > 0)) && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Messages</h3>
                <div className="space-y-3">
                  {(call.artifact?.messagesOpenAIFormatted ?? call.messages ?? []).map((msg, idx) => {
                    if (msg.role === 'system') return null;
                    const content = msg.content ?? (msg as Record<string, unknown>).message as string ?? '';
                    if (!content) return null;
                    return (
                      <div key={idx} className={`rounded-xl p-4 ${
                        msg.role === 'user' ? 'bg-blue-50' : msg.role === 'bot' ? 'bg-purple-50' : 'bg-gray-50'
                      }`}>
                        <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                          {msg.role}
                        </p>
                        <p className="text-sm text-[var(--color-text-primary)]">{content}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cost Breakdown */}
            {call.costBreakdown && (
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-brand-navy)] mb-3">Cost Breakdown</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {[
                    ['Transport', call.costBreakdown.transport],
                    ['STT (Speech-to-Text)', call.costBreakdown.stt],
                    ['LLM', call.costBreakdown.llm],
                    ['TTS (Text-to-Speech)', call.costBreakdown.tts],
                    ['VAPI Fee', call.costBreakdown.vapi],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-[var(--color-text-muted)]">{label}</span>
                      <span className="font-medium text-[var(--color-text-primary)]">${(value as number).toFixed(4)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[var(--color-border-subtle)] flex justify-between text-sm font-semibold">
                    <span className="text-[var(--color-brand-navy)]">Total</span>
                    <span className="text-[var(--color-brand-navy)]">${call.cost.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
