# Cross-Module Command Palette Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Cmd+K` command palette that searches Clients, Tickets, and Quotes simultaneously and navigates to the matching record.

**Architecture:** New `searchRouter` tRPC procedure runs 3 parallel Supabase queries and returns grouped results. A `SearchPalette` modal component mounts in the root layout, listens for `Cmd+K`, debounces input, and renders grouped results. Clicking a result navigates to the relevant module page.

**Tech Stack:** tRPC + Zod (backend), React + Tailwind (frontend), `react-hot-toast` already installed, Next.js `useRouter` for navigation.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/server/api/routers/search.ts` | **Create** | tRPC router with `global` query — searches clients, tickets, quotes in parallel |
| `src/server/api/root.ts` | **Modify** | Register `searchRouter` |
| `src/components/search/SearchPalette.tsx` | **Create** | Full command palette modal — input, results grouped by module, keyboard nav |
| `src/components/search/useSearchPalette.ts` | **Create** | Hook — open/close state + `Cmd+K` keyboard listener |
| `src/app/automations/layout.tsx` | **Modify** | Mount `SearchPalette` + `Cmd+K` trigger button in sidebar area |

---

## Task 1: Search tRPC Router

**Files:**
- Create: `src/server/api/routers/search.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the search router**

```typescript
// src/server/api/routers/search.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createClient } from "@/lib/supabase/server";

export type SearchResultItem = {
  id: string;
  label: string;        // Primary display text (name)
  sublabel: string;     // Secondary text (business/email)
  status?: string;      // Badge text
  module: "client" | "ticket" | "quote";
  href: string;         // Where to navigate on click
};

export type SearchResults = {
  clients: SearchResultItem[];
  tickets: SearchResultItem[];
  quotes: SearchResultItem[];
};

export const searchRouter = createTRPCRouter({
  global: publicProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }): Promise<SearchResults> => {
      const supabase = await createClient();
      const q = `%${input.query}%`;

      const [clientsRes, ticketsRes, quotesRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, company, email, status")
          .or(`name.ilike.${q},company.ilike.${q},email.ilike.${q}`)
          .limit(5),

        supabase
          .from("support_tickets")
          .select("id, caller_name, caller_business, caller_email, status")
          .or(`caller_name.ilike.${q},caller_business.ilike.${q},caller_email.ilike.${q}`)
          .limit(5),

        supabase
          .from("quotes")
          .select("id, contact_name, business_name, email, status")
          .or(`contact_name.ilike.${q},business_name.ilike.${q},email.ilike.${q}`)
          .limit(5),
      ]);

      const clients: SearchResultItem[] = (clientsRes.data ?? []).map((c) => ({
        id: c.id,
        label: c.name ?? "Unknown",
        sublabel: c.company ?? c.email ?? "",
        status: c.status,
        module: "client",
        href: `/automations/debt-recovery?search=${encodeURIComponent(c.name ?? "")}`,
      }));

      const tickets: SearchResultItem[] = (ticketsRes.data ?? []).map((t) => ({
        id: t.id,
        label: t.caller_name ?? "Unknown",
        sublabel: t.caller_business ?? t.caller_email ?? "",
        status: t.status,
        module: "ticket",
        href: `/automations/tickets?id=${t.id}`,
      }));

      const quotes: SearchResultItem[] = (quotesRes.data ?? []).map((q) => ({
        id: String(q.id),
        label: q.contact_name ?? q.business_name ?? "Unknown",
        sublabel: q.business_name ?? q.email ?? "",
        status: q.status,
        module: "quote",
        href: `/automations/quote-pipeline?search=${encodeURIComponent(q.contact_name ?? q.business_name ?? "")}`,
      }));

      return { clients, tickets, quotes };
    }),
});
```

- [ ] **Step 2: Register router in root.ts**

In `src/server/api/root.ts`, add:
```typescript
import { searchRouter } from "~/server/api/routers/search";

// inside appRouter:
search: searchRouter,
```

- [ ] **Step 3: Verify the router compiles**

```bash
cd /Users/zimraana/Desktop/AIIT/aiit-automation-hub && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to search).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/search.ts src/server/api/root.ts
git commit -m "feat: add global search tRPC router (clients, tickets, quotes)"
```

---

## Task 2: Search Palette State Hook

**Files:**
- Create: `src/components/search/useSearchPalette.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/components/search/useSearchPalette.ts
"use client";

import { useEffect, useState } from "react";

export function useSearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/search/useSearchPalette.ts
git commit -m "feat: add useSearchPalette hook with Cmd+K listener"
```

---

## Task 3: SearchPalette Component

**Files:**
- Create: `src/components/search/SearchPalette.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/search/SearchPalette.tsx
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

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input when opened
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
            {" "}to select · {" "}
            <kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">ESC</kbd>
            {" "}to close · {" "}
            <kbd className="rounded border border-gray-200 px-1 py-0.5 text-[10px]">⌘K</kbd>
            {" "}to toggle
          </p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/zimraana/Desktop/AIIT/aiit-automation-hub && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/search/SearchPalette.tsx
git commit -m "feat: add SearchPalette command palette component"
```

---

## Task 4: Wire Into Layout + Sidebar Search Trigger

**Files:**
- Modify: `src/app/automations/layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Check the automations layout**

Read `src/app/automations/layout.tsx` to see its current structure before editing.

- [ ] **Step 2: Mount SearchPalette in automations layout**

In `src/app/automations/layout.tsx`, add the palette at the root of the layout:

```tsx
"use client";

import { SearchPalette } from "@/components/search/SearchPalette";
import { useSearchPalette } from "@/components/search/useSearchPalette";

export default function AutomationsLayout({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useSearchPalette();

  return (
    <>
      <SearchPalette open={open} onClose={() => setOpen(false)} />
      {/* existing layout JSX */}
      {children}
    </>
  );
}
```

> Note: If the layout is currently a Server Component (no `"use client"`), you'll need to either add `"use client"` or extract the palette into a separate client wrapper component. Check the file first (Step 1) and adapt accordingly.

- [ ] **Step 3: Add search trigger button in Sidebar**

In `src/components/layout/Sidebar.tsx`, add a search button between the brand section and the nav. Insert after the divider (line ~76), before the `<nav>` block:

```tsx
{/* Search trigger */}
<div className={`relative px-2 pt-3 pb-1 ${collapsed ? '' : ''}`}>
  <button
    type="button"
    onClick={() => {
      // dispatch a custom event that the layout listens to
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    }}
    className={`flex w-full items-center rounded-xl border border-[var(--color-border-subtle)] bg-gray-50 hover:bg-gray-100 transition-colors text-[var(--color-text-muted)] ${
      collapsed ? 'justify-center p-2.5' : 'gap-2 px-3 py-2'
    }`}
    aria-label="Search (⌘K)"
  >
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
    {!collapsed && (
      <>
        <span className="flex-1 text-left text-[12px]">Search...</span>
        <kbd className="text-[10px] border border-gray-200 rounded px-1 py-0.5">⌘K</kbd>
      </>
    )}
  </button>
</div>
```

- [ ] **Step 4: Run the dev server and test manually**

```bash
cd /Users/zimraana/Desktop/AIIT/aiit-automation-hub && npm run dev
```

Verify:
- `Cmd+K` opens the palette from any page
- Typing 2+ characters shows results grouped by section
- Clicking a result navigates to the correct module
- `Esc` closes the palette
- Search button in sidebar also opens the palette

- [ ] **Step 5: Commit**

```bash
git add src/app/automations/layout.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: mount SearchPalette in layout and add sidebar search trigger"
```

---

## Task 5: Handle Quotes (Google Sheets backed)

> The quotes router fetches from Google Sheets, not Supabase. The search router queries a `quotes` Supabase table which may not exist. This task handles that gracefully.

**Files:**
- Modify: `src/server/api/routers/search.ts`

- [ ] **Step 1: Check if quotes table exists in Supabase**

In the dev app, open the Supabase dashboard or run a quick query to see if a `quotes` table exists. If it doesn't exist, the quotes search will return an empty array (Supabase returns an error, not a crash).

- [ ] **Step 2: Make quotes search fault-tolerant**

Update the quotes section in `search.ts` to handle missing table gracefully:

```typescript
// Replace the quotesRes section:
const quotesPromise = supabase
  .from("quotes")
  .select("id, contact_name, business_name, email, status")
  .or(`contact_name.ilike.${q},business_name.ilike.${q},email.ilike.${q}`)
  .limit(5);

const [clientsRes, ticketsRes, quotesRes] = await Promise.all([
  clientsPromise,
  ticketsPromise,
  quotesPromise,
]);

// For quotes, silently ignore errors (table may not exist yet)
const quotes: SearchResultItem[] = (quotesRes.error ? [] : quotesRes.data ?? []).map((q) => ({
  id: String(q.id),
  label: q.contact_name ?? q.business_name ?? "Unknown",
  sublabel: q.business_name ?? q.email ?? "",
  status: q.status,
  module: "quote",
  href: `/automations/quote-pipeline?search=${encodeURIComponent(q.contact_name ?? q.business_name ?? "")}`,
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/search.ts
git commit -m "fix: make quotes search fault-tolerant when table doesn't exist"
```

---

## Done

After all tasks complete, the feature is live:
- `Cmd+K` from anywhere opens the command palette
- Search across Clients, Tickets, Quotes in real time
- Results grouped by module with status badges
- Click navigates directly to the record
- Sidebar has a persistent search button for discoverability
