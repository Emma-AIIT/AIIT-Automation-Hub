/**
 * Outbound Calls page at /automations/outbound-calls.
 *
 * Ali writes a call script, picks which VAPI agent makes the calls and which
 * number they come from, pastes in a list of phone numbers, and starts dialling.
 * The script is sent as an assistantOverrides system prompt, so the chosen agent
 * keeps its voice and settings but says what the script tells it to.
 *
 * Numbers are parsed and normalised to E.164 as they are typed, so bad entries
 * are visible before anything is dialled. Starting a batch always goes through a
 * confirmation step: these are real calls to real people.
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/trpc/react';
import { parseNumberList, formatAuNumber, normaliseAuNumber } from '@/lib/phone';
import { ScriptLibrary } from '@/components/modules/outbound-calls/ScriptLibrary';
import { BatchHistory } from '@/components/modules/outbound-calls/BatchHistory';
import type { CallScript } from '@/server/api/routers/outboundCalls';

const MAX_NUMBERS = 200;

/** Service lines from Ali's call flow. Free text is still allowed. */
const CATEGORIES = ['AI Services', 'Web Dev Services', 'IT Services', 'Other'];

export default function OutboundCallsPage() {
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState('');
  const [script, setScript] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [category, setCategory] = useState('');
  const [smsAnswered, setSmsAnswered] = useState('');
  const [smsNotAnswered, setSmsNotAnswered] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  const [numbersRaw, setNumbersRaw] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [historyBump, setHistoryBump] = useState(0);

  const utils = api.useUtils();

  const { data: assistants = [], isLoading: assistantsLoading } = api.vapi.getAssistants.useQuery();
  const { data: fromNumbers = [], isLoading: numbersLoading } = api.vapi.getPhoneNumbers.useQuery();

  const saveMutation = api.outboundCalls.saveScript.useMutation({
    onSuccess: async (saved) => {
      setScriptId(saved.id);
      toast.success('Script saved');
      await utils.outboundCalls.listScripts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const parsed = useMemo(() => parseNumberList(numbersRaw), [numbersRaw]);

  const selectedAssistant = assistants.find((a) => a.id === assistantId);
  const selectedFrom = fromNumbers.find((n) => n.id === phoneNumberId);

  const overLimit = parsed.valid.length > MAX_NUMBERS;
  const canStart =
    script.trim().length > 0 &&
    parsed.valid.length > 0 &&
    !overLimit &&
    !!assistantId &&
    !!phoneNumberId &&
    !starting;

  const handleLoadScript = useCallback((s: CallScript) => {
    setScriptId(s.id);
    setScriptName(s.name);
    setCategory(s.category ?? '');
    setScript(s.script);
    setFirstMessage(s.first_message ?? '');
    setSmsAnswered(s.sms_answered ?? '');
    setSmsNotAnswered(s.sms_not_answered ?? '');
  }, []);

  const handleDeletedScript = useCallback((id: string) => {
    setScriptId((current) => (current === id ? null : current));
  }, []);

  const handleNewScript = useCallback(() => {
    setScriptId(null);
    setScriptName('');
    setCategory('');
    setScript('');
    setFirstMessage('');
    setSmsAnswered('');
    setSmsNotAnswered('');
  }, []);

  const handleSave = useCallback(() => {
    if (!scriptName.trim()) return toast.error('Give the script a name first');
    if (!script.trim()) return toast.error('The script is empty');
    saveMutation.mutate({
      id: scriptId ?? undefined,
      name: scriptName.trim(),
      category: category.trim() || undefined,
      script: script.trim(),
      firstMessage: firstMessage.trim() || undefined,
      smsAnswered: smsAnswered.trim() || undefined,
      smsNotAnswered: smsNotAnswered.trim() || undefined,
    });
  }, [scriptId, scriptName, category, script, firstMessage, smsAnswered, smsNotAnswered, saveMutation]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId,
          scriptName: scriptName.trim() || 'Untitled script',
          script: script.trim(),
          firstMessage: firstMessage.trim() || null,
          assistantId,
          assistantName: selectedAssistant?.name ?? null,
          phoneNumberId,
          fromNumber: selectedFrom?.number ?? null,
          numbers: parsed.valid.map((n) => n.e164!),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          transferNumber: transferNumber.trim() ? normaliseAuNumber(transferNumber).e164 : null,
        }),
      });

      const json = (await res.json()) as { error?: string; queued?: number; scheduled?: number };
      if (!res.ok) throw new Error(json.error ?? 'Could not start the calls');

      if (json.scheduled) {
        toast.success(`Scheduled ${json.scheduled} call${json.scheduled === 1 ? '' : 's'}`);
      } else {
        toast.success(`Calling ${json.queued} number${json.queued === 1 ? '' : 's'}`);
      }
      setNumbersRaw('');
      setConfirming(false);
      setHistoryBump((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the calls');
    } finally {
      setStarting(false);
    }
  }, [scriptId, scriptName, script, firstMessage, assistantId, phoneNumberId, selectedAssistant, selectedFrom, parsed, scheduledAt, transferNumber]);

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-lg border border-(--color-border-default) bg-white text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-border-strong)';

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-(--color-text-primary)">Outbound Calls</h1>
          <p className="text-sm text-(--color-text-muted) mt-0.5">
            Write a script, add the numbers, and the agent calls them
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
        {/* Left: script editor + library */}
        <div className="space-y-6">
          <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-(--color-border-subtle) flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-(--color-text-primary)">Call Script</h2>
                <p className="text-xs text-(--color-text-muted) mt-0.5">
                  What the agent should say and how it should handle the call
                </p>
              </div>
              <button
                onClick={handleNewScript}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-(--color-border-default) text-(--color-text-secondary) hover:bg-(--color-bg-hover) transition"
              >
                New
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3">
                <div>
                  <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                    Script name
                  </label>
                  <input
                    type="text"
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    placeholder="e.g. Lead follow-up, September"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                    Service line
                  </label>
                  <input
                    type="text"
                    list="call-script-categories"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="AI Services"
                    className={inputClass}
                  />
                  <datalist id="call-script-categories">
                    {CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                  Opening line <span className="text-(--color-text-faint) font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="Hi, it's Ali's assistant calling from All In IT Solutions."
                  className={inputClass}
                />
                <p className="text-[11px] text-(--color-text-faint) mt-1">
                  The first thing said when the call connects. Leave blank to use the agent&apos;s own greeting.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                  Script
                </label>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={12}
                  placeholder={
                    'You are calling on behalf of All In IT Solutions.\n\nYour goal:\n1. Confirm you are speaking to the right person\n2. Explain why you are calling\n3. Ask if they would like a callback from Ali\n\nStay friendly and professional. If they are not interested, thank them and end the call politely.'
                  }
                  className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
                />
              </div>

              {/* Follow-up SMS. Sent automatically once the call ends, which is
                  why they live with the script rather than with the number list. */}
              <div className="pt-1 border-t border-(--color-border-subtle) space-y-3">
                <p className="text-xs font-medium text-(--color-text-secondary) pt-3">Follow-up SMS</p>

                <div>
                  <label className="block text-[11px] text-(--color-text-muted) mb-1.5">
                    If they pick up
                  </label>
                  <textarea
                    value={smsAnswered}
                    onChange={(e) => setSmsAnswered(e.target.value)}
                    rows={2}
                    placeholder="Thanks for speaking with us just now. Ali will follow up shortly. Reply STOP to opt out."
                    className={`${inputClass} resize-y text-[13px]`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-(--color-text-muted) mb-1.5">
                    If they miss the call
                  </label>
                  <textarea
                    value={smsNotAnswered}
                    onChange={(e) => setSmsNotAnswered(e.target.value)}
                    rows={2}
                    placeholder="We just tried to reach you from All In IT Solutions. Call back any time, or reply here. Reply STOP to opt out."
                    className={`${inputClass} resize-y text-[13px]`}
                  />
                </div>

                <p className="text-[10px] text-(--color-text-faint)">
                  Leave blank to use the default wording. A copy of every outcome is texted to the ops number either way.
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-(--color-text-faint)">{script.length} characters</span>
                  <button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-(--color-border-default) text-(--color-text-secondary) hover:bg-(--color-bg-hover) disabled:opacity-50 transition"
                  >
                    {saveMutation.isPending ? 'Saving...' : scriptId ? 'Save changes' : 'Save script'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ScriptLibrary activeId={scriptId} onLoad={handleLoadScript} onDeleted={handleDeletedScript} />
        </div>

        {/* Right: who calls, who gets called */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Who to call</h2>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              One number per line. Pasting from a spreadsheet works.
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">Agent</label>
                <select
                  value={assistantId}
                  onChange={(e) => setAssistantId(e.target.value)}
                  className={inputClass}
                  disabled={assistantsLoading}
                >
                  <option value="">{assistantsLoading ? 'Loading...' : 'Choose an agent'}</option>
                  {assistants.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">Call from</label>
                <select
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className={inputClass}
                  disabled={numbersLoading}
                >
                  <option value="">{numbersLoading ? 'Loading...' : 'Choose a number'}</option>
                  {fromNumbers.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                Phone numbers
              </label>
              <textarea
                value={numbersRaw}
                onChange={(e) => setNumbersRaw(e.target.value)}
                rows={9}
                placeholder={'0412 345 678\n0498 765 432\n+61 2 9876 5432'}
                className={`${inputClass} resize-y font-mono text-[13px]`}
              />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <span className="text-[11px] text-[#1a9e4e] font-medium">
                  {parsed.valid.length} ready to call
                </span>
                {parsed.duplicates > 0 && (
                  <span className="text-[11px] text-(--color-text-muted)">
                    {parsed.duplicates} duplicate{parsed.duplicates === 1 ? '' : 's'} removed
                  </span>
                )}
                {parsed.invalid.length > 0 && (
                  <span className="text-[11px] text-red-500">
                    {parsed.invalid.length} unreadable
                  </span>
                )}
              </div>

              {parsed.invalid.length > 0 && (
                <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-[11px] font-medium text-red-600 mb-1">
                    These will be skipped
                  </p>
                  <ul className="space-y-0.5">
                    {parsed.invalid.slice(0, 6).map((n, i) => (
                      <li key={i} className="text-[11px] text-red-500 font-mono">
                        {n.raw} <span className="font-sans opacity-70">({n.reason})</span>
                      </li>
                    ))}
                    {parsed.invalid.length > 6 && (
                      <li className="text-[11px] text-red-400">
                        and {parsed.invalid.length - 6} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {overLimit && (
                <p className="mt-2 text-[11px] text-red-500">
                  That is {parsed.valid.length} numbers. The limit is {MAX_NUMBERS} per batch.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-(--color-border-subtle)">
              <div className="pt-4">
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                  Send at <span className="text-(--color-text-faint) font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={inputClass}
                />
                <p className="text-[10px] text-(--color-text-faint) mt-1">
                  Leave blank to dial now.
                </p>
              </div>

              <div className="sm:pt-4">
                <label className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
                  Transfer to <span className="text-(--color-text-faint) font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={transferNumber}
                  onChange={(e) => setTransferNumber(e.target.value)}
                  placeholder="0414 441 371"
                  className={inputClass}
                />
                <p className="text-[10px] text-(--color-text-faint) mt-1">
                  The agent can put a warm lead straight through to this number.
                </p>
              </div>
            </div>

            <button
              onClick={() => setConfirming(true)}
              disabled={!canStart}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {starting
                ? 'Starting...'
                : scheduledAt
                  ? `Schedule ${parsed.valid.length || ''} ${parsed.valid.length === 1 ? 'call' : 'calls'}`.replace(/\s+/g, ' ').trim()
                  : `Call ${parsed.valid.length || ''} ${parsed.valid.length === 1 ? 'person' : 'people'}`.replace(/\s+/g, ' ').trim()}
            </button>
          </div>
        </div>
      </div>

      <BatchHistory refreshBump={historyBump} />

      {/* Confirmation. These are real calls, so never dial straight off one click. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-(--color-border-subtle) overflow-hidden">
            <div className="px-5 py-4 border-b border-(--color-border-subtle)">
              <h3 className="text-sm font-semibold text-(--color-text-primary)">Start calling?</h3>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-(--color-text-secondary)">
                {scheduledAt ? (
                  <>
                    This will place <strong>{parsed.valid.length}</strong> real phone call
                    {parsed.valid.length === 1 ? '' : 's'} at{' '}
                    <strong>{new Date(scheduledAt).toLocaleString('en-AU')}</strong>.
                  </>
                ) : (
                  <>
                    This will place <strong>{parsed.valid.length}</strong> real phone call
                    {parsed.valid.length === 1 ? '' : 's'} straight away.
                  </>
                )}
              </p>

              <dl className="text-xs space-y-1.5 p-3 rounded-lg bg-(--color-bg-secondary) border border-(--color-border-subtle)">
                <div className="flex justify-between gap-3">
                  <dt className="text-(--color-text-muted)">Agent</dt>
                  <dd className="text-(--color-text-primary) font-medium text-right">{selectedAssistant?.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-(--color-text-muted)">Calling from</dt>
                  <dd className="text-(--color-text-primary) font-medium text-right">{selectedFrom?.name}</dd>
                </div>
                {transferNumber.trim() && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-(--color-text-muted)">Can transfer to</dt>
                    <dd className="text-(--color-text-primary) font-medium text-right">{transferNumber}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-(--color-text-muted)">Script</dt>
                  <dd className="text-(--color-text-primary) font-medium text-right truncate">
                    {scriptName.trim() || 'Untitled script'}
                  </dd>
                </div>
              </dl>

              <div className="max-h-32 overflow-y-auto p-2.5 rounded-lg border border-(--color-border-subtle)">
                <ul className="space-y-0.5">
                  {parsed.valid.slice(0, 20).map((n, i) => (
                    <li key={i} className="text-[11px] font-mono text-(--color-text-secondary)">
                      {formatAuNumber(n.e164!)}
                    </li>
                  ))}
                  {parsed.valid.length > 20 && (
                    <li className="text-[11px] text-(--color-text-faint)">
                      and {parsed.valid.length - 20} more
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-(--color-border-subtle) flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={starting}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) text-(--color-text-secondary) hover:bg-(--color-bg-hover) disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleStart()}
                disabled={starting}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition"
              >
                {starting ? 'Starting...' : scheduledAt ? 'Yes, schedule them' : 'Yes, start calling'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
