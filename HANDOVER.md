# AIIT Automation Hub — Handover & Technical Reference

> **Last Updated**: 2026-03-25
> **Maintained by**: Zimraan (Full Stack AI Developer)
> **Owner**: All In IT Solutions — Ali Taufeek (CEO)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Local Dev Setup](#3-local-dev-setup)
4. [Environment Variables](#4-environment-variables)
5. [Module Reference](#5-module-reference)
6. [Make.com Integration Map](#6-makecom-integration-map)
7. [Database Tables](#7-database-tables)
8. [tRPC Router Reference](#8-trpc-router-reference)
9. [Cron Jobs](#9-cron-jobs)
10. [Deployment](#10-deployment)
11. [Key Gotchas](#11-key-gotchas)
12. [Roadmap](#12-roadmap)

---

## 1. Project Overview

AIIT Automation Hub replaces manual Google Sheets-based workflows with a real-time internal dashboard. Each business automation is a **module** — the first and most complete is the **Debt Recovery Hub**, which tracks client payment streaks, triggers automated outreach (AI calls, SMS, email), and syncs live from Xero.

**Core principle**: The dashboard is a **viewing layer only**. All business logic, calculations, and automation happen in Make.com. The frontend displays what the automation layer decides and provides controls to trigger actions.

**Users**: Internal All In IT Solutions team (Ali Taufeek, Zimraan, team members)

**Future direction**: White-label SaaS for accounting firms and service businesses.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│              FRONTEND (Next.js 15 / Vercel)             │
│  Pages, components, tRPC queries, real-time UI          │
└──────────────┬──────────────────────┬───────────────────┘
               │ tRPC                 │ Supabase realtime
               ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│  tRPC API Routes     │  │  Supabase (PostgreSQL)        │
│  /src/server/api/    │  │  All persistent data          │
│  Zod-validated       │  │  Row-level access             │
└──────────┬───────────┘  └──────────────────────────────┘
           │ HTTP webhooks (outbound)
           ▼
┌─────────────────────────────────────────────────────────┐
│              MAKE.COM (Automation Layer)                 │
│  Xero sync · Payment detection · Streak tracking        │
│  VAPI calls · Twilio SMS · Outlook email                │
│  WhatsApp broadcasts · Ticket ingestion                 │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── automations/              # All module pages
│   │   ├── layout.tsx            # Shared sidebar layout
│   │   ├── page.tsx              # Main dashboard (activity feed, agent status)
│   │   ├── debt-recovery/        # Debt Recovery module
│   │   ├── tickets/              # Support Tickets module
│   │   ├── quote-pipeline/       # Quote Pipeline module
│   │   ├── voice-agents/         # VAPI Voice Agents module
│   │   ├── whatsapp-groups/      # WhatsApp Broadcasts module
│   │   ├── whatsapp-participants/ # WhatsApp Participants module
│   │   └── invoicing-logs/       # Invoicing Logs module
│   ├── api/                      # Next.js API routes (non-tRPC)
│   └── login/                    # Auth page
├── components/
│   ├── layout/                   # Sidebar, nav items, context
│   ├── dashboard/                # Shared dashboard components
│   ├── search/                   # Command palette (Cmd+K)
│   ├── ui/                       # Generic UI primitives
│   └── shared/                   # Cross-module shared components
├── server/
│   └── api/
│       ├── root.ts               # Combines all routers
│       ├── trpc.ts               # tRPC context + init
│       └── routers/              # One file per module
├── lib/
│   ├── config/
│   │   └── whatsapp-accounts.ts  # WhatsApp account config + webhook resolver
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client (SSR)
│   │   └── admin.ts              # Admin client (service role)
│   └── ...                       # Other utilities
├── config/
│   └── voice-agents.ts           # VAPI agent configs (IDs, phone numbers)
├── types/                        # Shared TypeScript types
├── trpc/                         # tRPC client setup
│   ├── react.tsx                 # React provider + hooks
│   └── server.ts                 # Server-side caller (RSC)
├── env.js                        # Environment variable schema (Zod)
└── middleware.ts                 # Next.js middleware
supabase/
└── migrations/                   # SQL migration files
docs/                             # Make.com scenario docs, workflow notes
```

---

## 3. Local Dev Setup

### Prerequisites

- Node.js 20+
- npm
- Access to the Supabase project (ask Zimraan or Ali for credentials)
- Access to Make.com workspace (for webhook URLs)

### Steps

```bash
# 1. Clone
git clone <repo-url>
cd aiit-automation-hub

# 2. Install dependencies
npm install

# 3. Set up env vars
cp .env.example .env
# Fill in values — see Section 4 for descriptions

# 4. Start dev server
npm run dev
# → http://localhost:3000 (redirects to /automations)
```

### Database

The database is hosted on Supabase — no local DB needed. Migrations live in `/supabase/migrations/` and are applied via:

```bash
# Via Supabase CLI (if installed)
supabase db push

# Or manually paste migration SQL into Supabase Dashboard > SQL Editor
```

### Build

```bash
npm run build    # Production build
npm run lint     # ESLint check
```

---

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in all values. Get actual values from Zimraan or the Supabase/Make.com dashboards.

### Supabase

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public JWT (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role JWT — **server only, never expose client-side** |

### Make.com Webhooks — Debt Recovery

| Variable | Triggered by | What it does |
|----------|-------------|--------------|
| `MAKE_SYNC_WEBHOOK_URL` | "Sync Now" button on dashboard | Triggers full Xero sync in Make.com |
| `MAKE_OUTREACH_WEBHOOK_URL` | (future) Manual outreach trigger | Fires Monday outreach flow on demand |

### Make.com Webhooks — Tickets

| Variable | Triggered by | What it does |
|----------|-------------|--------------|
| `MAKE_PULL_TICKETS_WEBHOOK_URL` | Tickets page load / manual refresh | Pulls new tickets from Outlook via Make.com |
| `MAKE_STALE_TICKET_WEBHOOK_URL` | Cron job (`/api/cron/whatsapp`) | Marks stale tickets, notifies support |
| `MAKE_SEND_EMAIL_WEBHOOK_URL` | "Send Reply" in ticket drawer | Sends email reply via Outlook through Make.com |

### Make.com Webhooks — Quote Pipeline

| Variable | Triggered by | What it does |
|----------|-------------|--------------|
| `MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL` | Quote Pipeline page load | Fetches latest quotes from Xero via Make.com |
| `MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL` | Status change in quote drawer | Updates quote status in Xero via Make.com |

### Make.com Webhooks — WhatsApp (AIIT Automation account)

| Variable | What it does |
|----------|-------------|
| `MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL` | Syncs WhatsApp groups to Supabase |
| `MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL` | Sends broadcast message to a group |
| `MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL` | Syncs group participants to Supabase |

### Make.com Webhooks — WhatsApp (Susu Closets account)

| Variable | What it does |
|----------|-------------|
| `MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL` | Syncs groups for Susu Closets |
| `MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL` | Sends broadcast for Susu Closets |
| `MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL` | Syncs participants for Susu Closets |

### Make.com Webhooks — WhatsApp (GIM Foundation account)

| Variable | What it does |
|----------|-------------|
| `MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL` | Syncs groups for GIM Foundation |
| `MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL` | Sends broadcast for GIM Foundation |
| `MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL` | Syncs participants for GIM Foundation |

### VAPI

| Variable | Description |
|----------|-------------|
| `VAPI_API_KEY` | API key for VAPI voice agent platform |

### Security

| Variable | Description |
|----------|-------------|
| `WHATSAPP_IMPORT_SECRET` | Bearer token for the `/api/whatsapp/import-participants-csv` endpoint |
| `CRON_SECRET` | Bearer token for cron job endpoints (`/api/cron/`, `/api/stale-tickets`) |

---

## 5. Module Reference

### Debt Recovery

**What it does**: Tracks client payment streaks synced from Xero. Displays balance, streak week count, and status (current → warning → critical → suspended). Automated outreach runs via Make.com on Monday mornings.

**Status logic**:
- 0–1 weeks no payment → `current` (green)
- 2 weeks → `warning` (amber)
- 3+ weeks → `critical` (red)
- 3+ weeks AND 21+ days since last payment → `suspended` (grey)

**Key files**:
- Page: [src/app/automations/debt-recovery/page.tsx](src/app/automations/debt-recovery/page.tsx)
- Router: [src/server/api/routers/clients.ts](src/server/api/routers/clients.ts)
- Components: [src/components/dashboard/](src/components/dashboard/)

**Make.com flows**: Daily Xero sync (6am), Payment watcher, Weekly streak tracker (Monday 6:30am), Monday outreach (9am), Suspension tracker (daily 7am)

**UPSERT rule** (critical): When syncing from Xero, only update contact info and `currentBalance`. Never overwrite `streakWeeks`, `previousBalance`, `status`, or `lastContactDate` — these are managed by Make.com automations.

---

### Tickets

**What it does**: Ingests support emails from Outlook via Make.com (GPT extracts subject/body/contact). Displays ticket list with status, priority, and client. Supports replies sent back via Outlook through Make.com. VAPI call data can be linked to tickets.

**Key files**:
- Page: [src/app/automations/tickets/page.tsx](src/app/automations/tickets/page.tsx)
- Router: [src/server/api/routers/tickets.ts](src/server/api/routers/tickets.ts)
- Components: `TicketList.tsx`, `TicketDetail.tsx`, `CreateTicketModal.tsx`

**API routes**:
- `POST /api/create-ticket` — called by Make.com when a new email arrives
- `POST /api/add-ticket-reply` — called by Make.com when a reply email is received
- `GET /api/stale-tickets` — cron endpoint that flags tickets with no activity

**Make.com flows**: Watch Outlook inbox → GPT parse → POST to `/api/create-ticket`. Watch replies → POST to `/api/add-ticket-reply`.

---

### Quote Pipeline

**What it does**: Shows sales proposals/quotes fetched from Xero. Allows status updates (e.g., sent → won/lost) that sync back to Xero via Make.com.

**Key files**:
- Page: [src/app/automations/quote-pipeline/page.tsx](src/app/automations/quote-pipeline/page.tsx)
- Router: [src/server/api/routers/quotePipeline.ts](src/server/api/routers/quotePipeline.ts)
- Components: `QuoteTable.tsx`, `QuoteStats.tsx`, `QuoteDetailDrawer.tsx`, `QuoteFilters.tsx`

**Make.com flows**: Triggered on page load to pull quotes; triggered on status update to push back to Xero.

---

### Voice Agents

**What it does**: Dashboard for 5 VAPI-powered AI agents (inbound and outbound). Shows call logs, outcomes, recording links, agent status cards, and call metrics charts.

**Agents configured** (see [src/config/voice-agents.ts](src/config/voice-agents.ts)):
- Each agent has an `assistantId` (VAPI) and assigned phone number
- Currently 5 agents: check `AGENT_CONFIGS` in that file for current list

**Key files**:
- Page: [src/app/automations/voice-agents/page.tsx](src/app/automations/voice-agents/page.tsx)
- Router: [src/server/api/routers/vapi.ts](src/server/api/routers/vapi.ts)
- Components: `AgentCard.tsx`, `CallLogTable.tsx`, `CallDetailDrawer.tsx`

**Note**: Call recordings are fetched directly from VAPI API. Recording URLs expire after 30 days — download to Supabase Storage if long-term storage needed.

---

### WhatsApp Groups & Participants

**What it does**: Manages WhatsApp broadcast groups across multiple accounts. Allows sending broadcast messages to specific groups, viewing group members, importing participants via CSV.

**Accounts** (configured in [src/lib/config/whatsapp-accounts.ts](src/lib/config/whatsapp-accounts.ts)):
- `aiit-automation` — AIIT Automation (active)
- `susu-closets` — Susu Closets (set up, tabs hidden until ready)
- `gim-foundation` — GIM Foundation (set up, tabs hidden until ready)

**Key files**:
- Pages: `whatsapp-groups/page.tsx`, `whatsapp-participants/page.tsx`
- Router: [src/server/api/routers/whatsapp.ts](src/server/api/routers/whatsapp.ts)
- Config: [src/lib/config/whatsapp-accounts.ts](src/lib/config/whatsapp-accounts.ts)

**API routes**:
- `POST /api/whatsapp/send` — sends a broadcast message (routes to correct account via `accountId`)
- `GET /api/whatsapp/download-phones` — exports participant phone numbers by account
- `POST /api/whatsapp/import-participants-csv` — bulk imports participants (requires `WHATSAPP_IMPORT_SECRET`)

**Adding a new WhatsApp account**: Add to `WhatsAppAccountId` union type and `WHATSAPP_ACCOUNTS` array in `whatsapp-accounts.ts`, add 3 env vars per account, add entries to `getWebhookUrl()` map, create Make.com scenarios.

---

### Invoicing Logs

**What it does**: Read-only log viewer for invoicing-related messages and transactions synced from Make.com.

**Key files**:
- Page: [src/app/automations/invoicing-logs/page.tsx](src/app/automations/invoicing-logs/page.tsx)
- Router: [src/server/api/routers/invoicing.ts](src/server/api/routers/invoicing.ts)

---

### Main Dashboard (`/automations`)

**What it does**: Landing page showing aggregate stats (total clients, outstanding balance, open tickets), live VAPI agent status cards, call metrics chart, and a recent activity feed.

**Key files**:
- Page: [src/app/automations/page.tsx](src/app/automations/page.tsx)
- Router: [src/server/api/routers/stats.ts](src/server/api/routers/stats.ts)
- Components: `StatsCard.tsx`, `AgentStatusCards.tsx`, `VapiMetricsChart.tsx`, `ModuleCard.tsx`

---

### Search (Cmd+K or Crtl+K)

**What it does**: Global command palette (Cmd+K or Crtl+K) that searches across clients, tickets, and quotes simultaneously. Navigates directly to the result — clicking a ticket opens its drawer, clicking a client pre-filters the debt recovery table.

**Key files**:
- Component: [src/components/search/SearchPalette.tsx](src/components/search/SearchPalette.tsx)
- Router: [src/server/api/routers/search.ts](src/server/api/routers/search.ts)
- Mounted in: [src/app/automations/layout.tsx](src/app/automations/layout.tsx)

---

## 6. Make.com Integration Map

All Make.com communication is **webhook-based**. The app sends an HTTP POST to Make.com; Make.com does its work and either responds synchronously or POSTs back to an API route.

| Env Var | Direction | Trigger | Make.com Scenario |
|---------|-----------|---------|-------------------|
| `MAKE_SYNC_WEBHOOK_URL` | App → Make | "Sync Now" button | Daily Xero Sync (manual trigger) |
| `MAKE_PULL_TICKETS_WEBHOOK_URL` | App → Make | Tickets page / refresh | Watch Outlook → Parse → Insert tickets |
| `MAKE_STALE_TICKET_WEBHOOK_URL` | App → Make | Cron job (daily) | Stale ticket checker |
| `MAKE_SEND_EMAIL_WEBHOOK_URL` | App → Make | "Send Reply" in ticket | Send email via Outlook |
| `MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL` | App → Make | Quote Pipeline page load | Fetch quotes from Xero |
| `MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL` | App → Make | Quote status change | Update quote in Xero |
| `MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL` | App → Make | Groups page load / sync | Sync WhatsApp groups to Supabase |
| `MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL` | App → Make | "Send Broadcast" button | Send WhatsApp message to group |
| `MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL` | App → Make | Participants page / sync | Sync group members to Supabase |

**Make.com → App** (inbound to API routes):
| Endpoint | Called by Make.com when |
|----------|------------------------|
| `POST /api/create-ticket` | New support email arrives in Outlook |
| `POST /api/add-ticket-reply` | A reply email is received |
| `POST /api/trpc/webhooks.*` | Xero payment detected, streak updated, etc. |

**Scheduled Make.com scenarios** (no webhook needed — Make.com triggers on its own schedule):
| Scenario | Schedule | What it does |
|----------|----------|-------------|
| Daily Xero Sync | 6:00am AEDT daily | Syncs all Xero contacts + balances to Supabase |
| Weekly Streak Tracker | Monday 6:30am | Calculates payment streaks, updates client statuses |
| Monday Outreach | Monday 9:00am | VAPI calls + Twilio SMS + Outlook email for warning/critical clients |
| Suspension Tracker | 7:00am daily | Sends final notices + suspends clients 21+ days overdue |

---

## 7. Database Tables

All tables are in Supabase (PostgreSQL). Migrations are in `/supabase/migrations/`.

| Table | Purpose | Primary writer |
|-------|---------|---------------|
| `clients` | Client records synced from Xero — balance, streak, status | Make.com (via tRPC webhooks) |
| `weekly_snapshots` | Monday balance snapshots for each client | Make.com (Weekly Streak Tracker) |
| `activity_log` | All client activity: calls, SMS, emails, payments, syncs | Make.com + app |
| `support_tickets` | Ingested support tickets from Outlook | Make.com (`/api/create-ticket`) |
| `ticket_attachments` | File attachments linked to tickets | Make.com / app |
| `invoicing_messages` | Invoicing transaction log entries | Make.com |

### `clients` — key columns

| Column | Type | Notes |
|--------|------|-------|
| `xero_contact_id` | string (unique) | Links to Xero contact |
| `current_balance` | decimal | Updated by Xero sync — **do not hardcode** |
| `previous_balance` | decimal | Set every Monday by streak tracker |
| `streak_weeks` | int | Weeks without payment — managed by Make.com |
| `status` | string | `current` / `warning` / `critical` / `suspended` |
| `last_contact_date` | timestamp | Updated by outreach automation |
| `last_call_outcome` | string | `answered` / `voicemail` / `no_answer` / `failed` |

---

## 8. tRPC Router Reference

All routers live in [src/server/api/routers/](src/server/api/routers/). Combined in [src/server/api/root.ts](src/server/api/root.ts).

| Router | File | Key procedures |
|--------|------|---------------|
| `clients` | `clients.ts` | `getAll`, `getById`, `getStats`, `updateStatus` |
| `tickets` | `tickets.ts` | `getAll`, `getById`, `create`, `addReply`, `updateStatus`, `getTemplates` |
| `quotePipeline` | `quotePipeline.ts` | `getAll`, `updateStatus`, `getStats` |
| `vapi` | `vapi.ts` | `getCallLogs`, `getAgentStats`, `getCallById` |
| `whatsapp` | `whatsapp.ts` | `getGroups`, `getParticipants`, `sendBroadcast`, `getBroadcastHistory`, `scheduleMessage` |
| `invoicing` | `invoicing.ts` | `getMessages`, `getStats` |
| `search` | `search.ts` | `global` (searches clients + tickets + quotes) |
| `webhooks` | `webhooks.ts` | Inbound handlers from Make.com |
| `sync` | `sync.ts` | `triggerXeroSync` |
| `stats` | `stats.ts` | `getDashboardStats` |
| `workers` | `workers.ts` | `getAll` |

### Using tRPC in components

```typescript
// Client component
import { api } from '~/trpc/react';

const { data, isLoading } = api.clients.getAll.useQuery();

// Server component
import { api } from '~/trpc/server';
const data = await api.clients.getAll();
```

---

## 9. Cron Jobs

| Endpoint | Schedule | Auth | What it does |
|----------|----------|------|-------------|
| `GET /api/stale-tickets` | Daily (set in Vercel Cron or external) | `Authorization: Bearer $CRON_SECRET` | Pings Make.com stale ticket webhook |
| `GET /api/cron/whatsapp` | Configurable | `Authorization: Bearer $CRON_SECRET` | WhatsApp scheduled broadcast runner |

Cron jobs are authenticated via `CRON_SECRET`. All callers must include `Authorization: Bearer <CRON_SECRET>` header.

To set up in Vercel: add cron entries in `vercel.json` (already configured).

---

## 10. Deployment

### Vercel

The app is deployed on Vercel with automatic deployments from the `main` branch.

1. Push to `main` → Vercel auto-deploys
2. All env vars must be set in **Vercel Dashboard → Project → Settings → Environment Variables**
3. See Section 4 for the full env var list

### Required Vercel env vars

All variables from Section 4 must be present in Vercel. Missing optional ones will cause specific features to silently fail (e.g., missing `MAKE_OUTREACH_WEBHOOK_URL` will break the outreach trigger button).

### Supabase

- **Project**: `mkmjmhiwjuhjgmamfuwa` (find in your Supabase dashboard)
- **Migrations**: Apply new migrations via Supabase CLI or Dashboard > SQL Editor
- **RLS**: Row Level Security is not currently enabled — plan to enable when multi-user auth is added

### Branching strategy

- `main` — production (auto-deploys to Vercel)
- Feature branches → PR → merge to `main`

---

## 11. Key Gotchas

### 1. Never overwrite automation-managed fields

When syncing from Xero or updating client records from the frontend, **never** update these fields — they are owned by Make.com:

- `streak_weeks`
- `previous_balance`
- `status`
- `last_contact_date`

Only update: `first_name`, `last_name`, `email`, `phone_number`, `business_name`, `current_balance`.

### 2. Supabase client vs server client

```typescript
// In 'use client' components — use browser client
import { createClient } from '~/lib/supabase/client';

// In Server Components / API routes — use server client
import { createClient } from '~/lib/supabase/server';

// In API routes needing admin access (bypasses RLS) — use admin client
import { createAdminClient } from '~/lib/supabase/admin';
```

### 3. env.js is the source of truth for env vars

All environment variables must be declared in [src/env.js](src/env.js) with a Zod schema. Adding a new var to `.env` without adding it to `env.js` means it won't be accessible via `env.XXX` and the build will not expose it.

### 4. Make.com error handlers

In Make.com scenarios, use **Resume** error handlers (not Ignore) on HTTP modules. With Ignore, downstream modules (like HTTP response/logging) will never run if the target errors. Resume always continues the flow.

### 5. Adding a new WhatsApp account

Three steps:
1. Add the account to `WhatsAppAccountId` union and `WHATSAPP_ACCOUNTS` array in `whatsapp-accounts.ts`
2. Add 3 env vars: `MAKE_WHATSAPP_<NAME>_PULL_GROUPS_WEBHOOK_URL`, `_SEND_MESSAGE_WEBHOOK_URL`, `_PULL_PARTICIPANTS_WEBHOOK_URL` — in `.env`, `.env.example`, `env.js`, and Vercel
3. Add to `getWebhookUrl()` map in `whatsapp-accounts.ts`

### 6. Susu Closets and GIM Foundation tabs

These accounts are configured and env vars are set, but the tabs are hidden in the UI via a commented-out entry in `WHATSAPP_ACCOUNTS`. Un-comment when ready to activate.

### 7. Date handling (seconds vs milliseconds)

Xero and some Make.com modules return Unix timestamps in seconds. JavaScript `Date` expects milliseconds. Always check:

```typescript
const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
const date = new Date(ms);
```

### 8. `useSearchParams` requires Suspense

Any component using `useSearchParams()` (Next.js) must be wrapped in `<Suspense>`. The debt-recovery and tickets pages already do this. New pages using URL search params need the same treatment.

---

## 12. Roadmap

### In Progress
- Client detail drawer with full activity timeline
- Payment history charts (Recharts)
- Manual action buttons from dashboard (trigger call/SMS/email directly)

### Backlog — Debt Recovery
- Bidirectional sync: frontend edits → Xero
- PDF export for reports

### Backlog — AIIT Automation Hub Expansion
- Multi-user authentication (NextAuth.js or Supabase Auth)
- Role-based permissions (admin vs. viewer)
- Module 2: Inventory Management (Xero inventory tracking)
- Module 3: Project Time Tracking (sync to Xero)
- Module 4: Invoice Generation Automation
- Module 5: Customer Onboarding Workflow
- Email template customization
- Webhook logs and monitoring dashboard

### Future — White-Label SaaS
- Multi-tenancy support
- Branding customization
- Billing via Stripe
- Customer portal
- API access for custom integrations
