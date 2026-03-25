/**
 * SearchPalette - Global command-palette overlay for cross-module search.
 * Queries clients, tickets, and quotes via tRPC as the user types, then navigates to
 * the relevant module page (opening the matching drawer) when a result is selected.
 * Controlled by the open/onClose props supplied by useSearchPalette.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import type { SearchResultItem } from "@/server/api/routers/search";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MODULE_LABELS = {
  client: "Clients",
  ticket: "Tickets",
  quote: "Quotes",
} as const;

const STATUS_COLORS: Record<string, string> = {
  current: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
  suspended: "bg-gray-100 text-gray-500",
  open: "bg-blue-100 text-blue-700",
  "in-progress": "bg-purple-100 text-purple-700",
  resolved: "bg-gray-100 text-gray-500",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Quote: "bg-blue-100 text-blue-700",
  Pending: "bg-amber-100 text-amber-700",
};

export function SearchPalette({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const { data, isFetching } = api.search.global.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const handleSelect = (item: SearchResultItem) => {
    router.push(item.href);
    onClose();
  };

  const sections = data
    ? ([
        { key: "clients", label: MODULE_LABELS.client, items: data.clients },
        { key: "tickets", label: MODULE_LABELS.ticket, items: data.tickets },
        { key: "quotes", label: MODULE_LABELS.quote, items: data.quotes },
      ] as const)
    : [];

  const hasResults = sections.some((s) => s.items.length > 0);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
          <svg
            className="h-4 w-4 flex-shrink-0 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search clients, tickets, quotes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          {isFetching && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          )}
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2">
          {debouncedQuery.length < 2 && (
            <p className="px-3 py-8 text-center text-sm text-gray-400">
              Type at least 2 characters to search
            </p>
          )}

          {debouncedQuery.length >= 2 && !isFetching && !hasResults && (
            <p className="px-3 py-8 text-center text-sm text-gray-400">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

          {sections.map(
            ({ key, label, items }) =>
              items.length > 0 && (
                <div key={key} className="mb-2">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {label}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {item.label}
                        </p>
                        {item.sublabel && (
                          <p className="truncate text-xs text-gray-400">
                            {item.sublabel}
                          </p>
                        )}
                      </div>
                      {item.status && (
                        <span
                          className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                            STATUS_COLORS[item.status] ??
                            "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-2">
          <p className="text-[10px] text-gray-400">
            <kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">↵</kbd>
            {" "}to select &middot;{" "}
            <kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">ESC</kbd>
            {" "}to close &middot;{" "}
            <kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">⌘K</kbd>
            {" "}to toggle
          </p>
        </div>
      </div>
    </>
  );
}
