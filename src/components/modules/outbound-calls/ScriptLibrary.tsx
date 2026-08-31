/**
 * ScriptLibrary - saved call scripts for the Outbound Calls page.
 * Lists every script from Supabase, highlights the one currently loaded into the
 * editor, and allows loading or deleting. Deleting asks for confirmation inline
 * rather than through a browser dialog, which would block the page.
 */
'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import type { CallScript } from '@/server/api/routers/outboundCalls';

interface ScriptLibraryProps {
  activeId: string | null;
  onLoad: (script: CallScript) => void;
  onDeleted: (id: string) => void;
}

export function ScriptLibrary({ activeId, onLoad, onDeleted }: ScriptLibraryProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const utils = api.useUtils();

  const { data: scripts = [], isLoading } = api.outboundCalls.listScripts.useQuery();

  const deleteMutation = api.outboundCalls.deleteScript.useMutation({
    onSuccess: async (_res, vars) => {
      setConfirmingId(null);
      onDeleted(vars.id);
      await utils.outboundCalls.listScripts.invalidate();
    },
  });

  return (
    <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-(--color-border-subtle)">
        <h2 className="text-sm font-semibold text-(--color-text-primary)">Saved Scripts</h2>
        <p className="text-xs text-(--color-text-muted) mt-0.5">Click one to load it into the editor</p>
      </div>

      {isLoading ? (
        <div className="px-5 py-6 text-xs text-(--color-text-muted)">Loading...</div>
      ) : scripts.length === 0 ? (
        <div className="px-5 py-6 text-xs text-(--color-text-faint)">
          No saved scripts yet. Write one on the right and hit Save.
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle) max-h-72 overflow-y-auto">
          {scripts.map((s) => (
            <li key={s.id} className={activeId === s.id ? 'bg-(--color-bg-secondary)' : ''}>
              <div className="px-5 py-3 flex items-start gap-2">
                <button
                  onClick={() => onLoad(s)}
                  className="flex-1 min-w-0 text-left group"
                >
                  <p className="text-sm font-medium text-(--color-text-primary) truncate group-hover:underline">
                    {s.name}
                  </p>
                  <p className="text-xs text-(--color-text-muted) truncate mt-0.5">
                    {s.script.slice(0, 80)}
                    {s.script.length > 80 ? '...' : ''}
                  </p>
                </button>

                {confirmingId === s.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => deleteMutation.mutate({ id: s.id })}
                      disabled={deleteMutation.isPending}
                      className="text-[11px] font-medium px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="text-[11px] px-2 py-1 rounded-md text-(--color-text-muted) hover:bg-(--color-bg-hover)"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(s.id)}
                    className="shrink-0 p-1.5 rounded-md text-(--color-text-faint) hover:text-red-500 hover:bg-red-50 transition"
                    title="Delete script"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
