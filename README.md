# AIIT Automation Hub

Internal business automation platform for **All In IT Solutions** — replacing manual Google Sheets workflows with real-time dashboards and automated outreach.

**Live URL**: https://debt-recovery-hub-rho.vercel.app/
**Stack**: Next.js 15 · tRPC · Supabase · Tailwind CSS · Make.com

---

## Modules

| Module | Description |
|--------|-------------|
| **Debt Recovery** | Client balance tracking, payment streak monitoring, automated collection outreach |
| **Tickets** | Support ticket management with email ingestion and VAPI call integration |
| **Quote Pipeline** | Sales proposal/quote tracking synced from Xero via Make.com |
| **Voice Agents** | VAPI-powered inbound/outbound AI call dashboard and call log viewer |
| **WhatsApp Groups** | Broadcast messaging to WhatsApp groups across multiple accounts |
| **Invoicing Logs** | Invoicing transaction and activity log viewer |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| API | tRPC 11, TanStack Query, Zod |
| Database | Supabase (PostgreSQL) |
| Automation | Make.com (webhooks, scheduled flows) |
| Voice | VAPI AI calling |
| Styling | Tailwind CSS 4, dark theme |
| Deployment | Vercel |

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd aiit-automation-hub
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in your values — see `.env.example` for all required variables and descriptions. Get the real values from the team (Zimraan or Ali).

### 3. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/automations`.

### 4. Database

The database is hosted on Supabase. No local DB setup needed. Migrations are in `/supabase/migrations/` and are applied manually via the Supabase dashboard or CLI.

---

## Full Documentation

For architecture, module deep-dives, Make.com integration map, deployment guide, and known gotchas — see [HANDOVER.md](./HANDOVER.md).
