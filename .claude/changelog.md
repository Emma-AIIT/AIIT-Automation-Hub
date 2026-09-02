# AIIT Automation Hub - Changelog

> **Purpose**: Track all changes, features, and fixes in the project
> **Format**: Newest entries first (reverse chronological)
> **Auto-Update**: Enabled - Claude should add entries when making changes

---

## How to Use This Changelog

**When to Add Entry**:
- New Make.com/n8n workflow created
- Database schema changes
- API endpoint added/modified
- Frontend component created/modified
- Bug fixed
- Configuration changed
- Dependency added/removed

**Entry Format**:
```markdown
### YYYY-MM-DD - Feature Name

**Added**:
- List of new features/files

**Changed**:
- List of modifications

**Fixed**:
- List of bugs fixed

**Technical Details**:
- Implementation notes
- Files modified
- Dependencies added

**Migration Notes** (if breaking changes):
- Steps to update existing installations

**Testing**: Brief note on what was tested

**Known Issues**: Any remaining issues
```

---

## 📝 Changelog Entries

### 2026-09-02 - WhatsApp broadcasts paced again

**Fixed**:
- Broadcasts sent every group at once instead of one every 15 minutes. The
  spacing was never in this codebase: the old client loop awaited a Make.com
  scenario that slept 15 minutes before replying, so the gap was a side effect of
  a blocked fetch. When the send moved server-side (61099fb) the fan-out became
  `Promise.allSettled` in batches of `SEND_CONCURRENCY = 8`, and the accidental
  pacing disappeared with it. Symptom: 11 Make.com executions all stamped
  11:34:31/11:35:31, one batch of 8 and one of 3, 60s apart - the batch size and
  `SEND_TIMEOUT_MS` written straight into the execution history.
- Broadcasts reported "Make.com did not respond within 60s" and were marked
  Failed even though every message was delivered. The scenario held the
  connection open for its full 15 minute sleep; the app called that a timeout.
- Scheduled sends had the same burst bug - `/api/cron/whatsapp` fanned out with an
  uncapped `Promise.allSettled` over every group. They now go through the queue.
- The orphan sweeper marked any broadcast in flight over 10 minutes as
  "not_sent". Every paced broadcast trips that by design, so it now skips
  anything the queue owns.

**Added**:
- `src/lib/server/whatsapp-broadcast.ts` - the queue: `enqueueBroadcast`,
  `drainBroadcastQueue`, `cancelBroadcast`. Pacing is enforced both by each row's
  `send_after` and by a check against the account's last real send, so two
  broadcasts queued on one number interleave instead of doubling the rate.
- `whatsapp_broadcast_queue` table (one row per group) and the
  `whatsapp-broadcasts` storage bucket, via
  `supabase/migrations/20260902000000_whatsapp_broadcast_pacing.sql`.
- Broadcast images are staged in storage rather than held in function memory -
  the last group of a long broadcast is sent hours later by a different
  invocation. Deleted when the broadcast settles.
- "Stop" button and live progress ("4 of 11 sent · next in 12 min") in Broadcast
  History. A paced broadcast runs for hours, so a wrong message needed an exit.
- `WHATSAPP_BROADCAST_INTERVAL_MINUTES` (optional, defaults to 15).
- 200 group cap per broadcast, with an error naming the run time. The Aug 26
  attempt at 568 groups would take 142 days at this interval.

**Changed**:
- `/api/whatsapp/broadcast` only enqueues now; nothing is sent in the request.
- `/api/cron/whatsapp` drains the queue on every tick (already ran every minute).

**Make.com — REQUIRED**:
- The send scenario's three `util:FunctionSleep` modules (300s each) MUST be
  removed. Pacing lives in the app now; leaving them stacks a second 15 minute
  delay on every group and re-creates the false timeout failures. A stripped
  blueprint was exported alongside the original.

---

### 2026-02-09 - Initial Project Setup

**Added**:
- Next.js 14 project with App Router
- Prisma ORM with Supabase PostgreSQL
- tRPC for type-safe API routes
- Database schema: `clients`, `weekly_snapshots`, `activity_log` tables
- Dark theme UI with Tailwind CSS
- shadcn/ui components

**Technical Details**:
- Framework: Next.js 14.0.4
- Database: Supabase PostgreSQL
- ORM: Prisma 5.20.0
- API: tRPC 10.45.0
- Styling: Tailwind CSS 3.4.0
- UI Components: shadcn/ui

**Files Created**:
- `/prisma/schema.prisma` - Database schema
- `/src/app/layout.tsx` - Root layout
- `/src/app/page.tsx` - Dashboard page
- `/src/server/db.ts` - Prisma client
- `/src/server/api/root.ts` - tRPC root router
- `/tailwind.config.ts` - Tailwind configuration

**Environment Variables**:
```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

**Migration Notes**:
```bash
# Initialize database
npx prisma migrate dev --name init
npx prisma generate

# Install dependencies
npm install
```

**Testing**: Local development server verified working

**Known Issues**: None

---

### 2026-02-09 - Dashboard Frontend (Stats Cards + Client Table)

**Added**:
- Stats cards component showing key metrics
- Client table with search and filter
- Status badge component with color coding
- Mobile-responsive layout

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:
- Components created:
  - `/components/dashboard/StatsCards.tsx` - Dashboard metrics (total outstanding, client count, at-risk, suspended)
  - `/components/dashboard/ClientTable.tsx` - Main data table with search/filter
  - `/components/dashboard/ClientRow.tsx` - Individual client row
  - `/components/ui/StatusBadge.tsx` - Visual status indicator
- tRPC routes:
  - `clients.getAll` - Fetch all clients with optional filters
  - `stats.getDashboard` - Calculate dashboard statistics
- Real-time updates via Supabase subscriptions

**UI/UX Features**:
- Dark theme (#0a0a0a background, #141414 cards)
- Status colors: Green (current), Amber (warning), Red (critical), Gray (suspended)
- Mobile-first responsive design
- Loading states with skeleton loaders
- Error states with user-friendly messages

**Files Created**:
- `/components/dashboard/StatsCards.tsx`
- `/components/dashboard/ClientTable.tsx`
- `/components/dashboard/ClientRow.tsx`
- `/components/ui/StatusBadge.tsx`
- `/server/api/routers/clients.ts`
- `/server/api/routers/stats.ts`

**Dependencies Added**:
- `lucide-react` - Icon library

**Testing**: 
- Verified stats cards calculate correctly
- Tested search/filter functionality
- Confirmed mobile responsiveness on iPhone SE, Samsung Galaxy S21
- Verified status badge colors match business rules

**Known Issues**: None

---

### 2026-02-09 - Make.com Workflow: Daily Xero Sync

**Added**:
- Make.com scenario: "Daily Xero Sync"
- API endpoint: POST /api/sync-xero (webhook)
- Scheduled daily sync at 6:00 AM AEDT
- UPSERT logic preserving automation-managed fields

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Make.com Scenario Flow**:
1. Schedule Trigger: Daily @ 6:00 AM AEDT
2. Xero API: GET /Invoices?Statuses=PAID,UNPAID
3. Iterator: Loop through each invoice
4. Xero API: GET /Contacts/{ContactID}
5. HTTP POST: /api/sync-xero (webhook to Next.js)
6. HTTP Response: Log success/failure

**API Endpoint**:
- Route: POST /api/sync-xero
- Input validation: Zod schema
- UPSERT logic:
  - UPDATE: firstName, lastName, email, phoneNumber, businessName, currentBalance
  - PRESERVE: streakWeeks, previousBalance, status, lastContactDate
- Activity logging: Records sync operation

**Critical Implementation**:
```typescript
// UPSERT preserves automation-managed fields
await db.client.upsert({
  where: { xeroContactId: data.xero_contact_id },
  update: {
    // Update from Xero
    firstName: data.first_name,
    currentBalance: data.current_balance,
    // PRESERVE (not in update object)
    // - streakWeeks
    // - previousBalance
    // - status
  },
  create: {
    // Initialize new client
    streakWeeks: 0,
    status: 'current',
    // ... other fields
  }
});
```

**Files Created**:
- `/app/api/sync-xero/route.ts` - Webhook endpoint
- Make.com scenario: "Daily Xero Sync"

**Environment Variables Added**:
```env
XERO_CLIENT_ID="..."
XERO_CLIENT_SECRET="..."
XERO_TENANT_ID="..."
```

**Migration Notes**:
- Configure Xero OAuth 2.0 application
- Store Xero credentials in environment variables
- Set up Make.com webhook URL in Xero app settings

**Testing**:
- Tested with Xero demo company
- Verified UPSERT preserves streakWeeks
- Confirmed activity log records sync events
- Tested error handling (Xero API failure)

**Known Issues**: None

---

### 2026-02-09 - Make.com Workflow: Manual Sync Now

**Added**:
- "Sync Now" button in dashboard header
- Webhook trigger for manual Xero sync
- Loading state during sync operation
- Success/error toast notifications

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Frontend Implementation**:
```typescript
// Dashboard header component
async function handleSyncNow() {
  setLoading(true);
  try {
    await fetch(process.env.NEXT_PUBLIC_MAKE_SYNC_WEBHOOK, {
      method: 'POST',
      body: JSON.stringify({ trigger: 'manual' })
    });
    toast.success('Sync started! Data will update in 30-60 seconds.');
    
    // Invalidate queries after delay
    setTimeout(() => {
      queryClient.invalidateQueries(['clients']);
    }, 30000);
  } catch (error) {
    toast.error('Sync failed. Please try again.');
  } finally {
    setLoading(false);
  }
}
```

**Make.com Scenario**:
- Trigger: Webhook (same URL as manual trigger)
- Flow: Identical to Daily Xero Sync
- Difference: Triggered on-demand instead of scheduled

**Files Modified**:
- `/app/page.tsx` - Added Sync Now button
- Make.com scenario: Created webhook trigger variation

**Environment Variables Added**:
```env
NEXT_PUBLIC_MAKE_SYNC_WEBHOOK="https://hook.us1.make.com/..."
```

**Testing**:
- Verified button triggers webhook
- Confirmed loading state displays
- Tested toast notifications (success/error)
- Verified data refreshes after sync

**Known Issues**: None

---

### 2026-02-09 - Make.com Workflow: Payment Watcher

**Added**:
- Make.com scenario: "Payment Watcher"
- API endpoint: POST /api/update-payment
- Payment detection and streak reset logic
- Activity logging for payment events

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Make.com Scenario Flow**:
1. Trigger: Scheduled (hourly) OR Xero webhook (future)
2. Xero API: GET /Invoices?Status=PAID&DateFrom={last_24_hours}
3. Iterator: Loop through paid invoices
4. Xero API: GET /Contacts/{ContactID}/Invoices
5. Calculate: Sum of unpaid invoice amounts = new_balance
6. HTTP POST: /api/update-payment

**Payment Detection Logic**:
```typescript
// Compare new balance with previous balance
if (new_balance < client.previousBalance) {
  // Payment made - reset streak
  await db.client.update({
    data: {
      currentBalance: new_balance,
      streakWeeks: 0,
      status: 'current',
      lastPaymentDate: new Date(),
    }
  });
  
  await logActivity({
    activityType: 'payment_received',
    notes: `Balance reduced from $${previousBalance} to $${new_balance}`
  });
} else {
  // No payment or balance increased
  await db.client.update({
    data: {
      currentBalance: new_balance,
      // streakWeeks unchanged
    }
  });
}
```

**Files Created**:
- `/app/api/update-payment/route.ts` - Payment processing endpoint
- Make.com scenario: "Payment Watcher"

**Testing**:
- Tested with simulated payments in Xero demo
- Verified streak resets when balance decreases
- Confirmed streak preserved when no payment
- Tested activity log entries
- Verified edge case: multiple payments same day

**Known Issues**: None

---

### 2026-02-09 - Make.com Workflow: Weekly Streak Tracker

**Added**:
- Make.com scenario: "Weekly Streak Tracker"
- Scheduled Monday morning execution (6:30 AM AEDT)
- Streak calculation and status updates
- Weekly snapshot historical tracking

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Make.com Scenario Flow**:
1. Schedule Trigger: Every Monday @ 6:30 AM AEDT
2. Supabase: GET all clients with currentBalance > 0
3. Iterator: Loop through each client
4. For each client:
   - Compare currentBalance vs previousBalance
   - If balance >= previousBalance: streakWeeks += 1
   - If balance < previousBalance: streakWeeks = 0
   - Calculate new status from streakWeeks
   - Create weekly_snapshots record
   - Update client: previousBalance = currentBalance

**Status Calculation**:
```javascript
// Make.com function
function calculateStatus(streakWeeks, daysSincePayment) {
  if (streakWeeks <= 1) return 'current';
  if (streakWeeks === 2) return 'warning';
  if (streakWeeks >= 3 && daysSincePayment < 21) return 'critical';
  if (streakWeeks >= 3 && daysSincePayment >= 21) return 'suspended';
  return 'current';
}
```

**Files Created**:
- Make.com scenario: "Weekly Streak Tracker"
- Database: `weekly_snapshots` table already exists from schema

**Testing**:
- Tested streak increment logic
- Verified status transitions (current → warning → critical → suspended)
- Confirmed weekly snapshots created correctly
- Tested previousBalance update
- Verified timezone handling (Australia/Sydney)

**Known Issues**: None

---

### 2026-02-09 - Make.com Workflow: Monday Outreach Automation

**Added**:
- Make.com scenario: "Monday Outreach"
- VAPI AI voice call integration
- Twilio SMS integration
- Microsoft Graph email integration
- Automated outreach for at-risk clients

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Make.com Scenario Flow**:
1. Schedule Trigger: Every Monday @ 9:00 AM AEDT
2. Supabase: GET clients WHERE status IN ('warning', 'critical')
3. Iterator: Loop through at-risk clients
4. For each client:
   a. VAPI: POST /call (AI voice call)
   b. Sleep: 2 seconds (rate limiting)
   c. Twilio: POST /Messages (SMS reminder)
   d. Microsoft Graph: POST /me/sendMail (Email reminder)
   e. Supabase: Log 3 activities (call, SMS, email)
   f. Supabase: Update lastContactDate

**VAPI Configuration**:
```json
{
  "assistantId": "debt_collection_assistant",
  "phoneNumber": "{{client.phoneNumber}}",
  "metadata": {
    "clientId": "{{client.id}}",
    "firstName": "{{client.firstName}}",
    "businessName": "{{client.businessName}}",
    "balance": "{{client.currentBalance}}",
    "streakWeeks": "{{client.streakWeeks}}"
  }
}
```

**Message Templates**:
- SMS: "Hi {firstName}, friendly reminder about your outstanding balance of ${balance}. Please contact us at 1300 XXX XXX. - All In IT Solutions"
- Email: Professional HTML template with balance, payment options, contact info

**Files Created**:
- Make.com scenario: "Monday Outreach"

**Environment Variables Added**:
```env
VAPI_API_KEY="..."
VAPI_PHONE_NUMBER_ID="..."
ELEVENLABS_VOICE_ID="..."
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="..."
MICROSOFT_CLIENT_ID="..."
MICROSOFT_CLIENT_SECRET="..."
MICROSOFT_TENANT_ID="..."
SENDER_EMAIL="..."
```

**Testing**:
- Tested VAPI call with test phone number
- Verified SMS delivery via Twilio
- Confirmed email sent via Microsoft Graph
- Tested activity log entries for all 3 contact types
- Verified lastContactDate updates

**Known Issues**: 
- VAPI recording URLs expire after 30 days (need to download to Supabase Storage for long-term retention)

---

### 2026-02-09 - Make.com Workflow: Suspension Tracker

**Added**:
- Make.com scenario: "Suspension Tracker"
- Daily check for clients meeting suspension criteria
- Final warning email automation
- Xero contact note update
- Status change to 'suspended'

**Changed**:
- None (initial implementation)

**Fixed**:
- None (initial implementation)

**Technical Details**:

**Make.com Scenario Flow**:
1. Schedule Trigger: Daily @ 7:00 AM AEDT
2. Supabase: GET clients WHERE status='critical' AND streakWeeks >= 3
3. Iterator: Loop through at-risk clients
4. For each client:
   - Calculate: daysSinceLastPayment = NOW() - lastPaymentDate
   - IF daysSinceLastPayment >= 21:
     a. Microsoft Graph: Send FINAL NOTICE email
     b. Xero API: Add note to contact
     c. Supabase: Update status = 'suspended'
     d. Supabase: Log suspension activity

**Suspension Criteria**:
- 3+ consecutive weeks without payment (streakWeeks >= 3)
- AND 21+ days since last payment
- Results in: status = 'suspended'

**Email Template**:
Subject: "FINAL NOTICE - Service Suspension Imminent"
Body: Professional warning about suspension in 48 hours, payment instructions

**Xero Note**:
"SUSPENDED: {date} - No payment for 21+ days. Contact: {email}"

**Files Created**:
- Make.com scenario: "Suspension Tracker"

**Testing**:
- Tested with simulated suspended clients
- Verified email sent correctly
- Confirmed Xero note added
- Tested status update to 'suspended'
- Verified activity log entry

**Known Issues**: None

---

### 2026-02-09 - Documentation System Setup

**Added**:
- `claude.md` - Comprehensive AI development guide
- `agents.md` - Multi-agent development system
- `changelog.md` - Project changelog (this file)

**Changed**:
- None (initial documentation)

**Fixed**:
- None (initial documentation)

**Technical Details**:

**claude.md Contents**:
- Project overview and mission
- Complete tech stack documentation
- Database schema (Prisma)
- All 6 Make.com workflows documented
- API endpoint specifications
- Design system (dark theme)
- Coding standards
- Integration notes (Xero, VAPI, Twilio, Microsoft Graph)
- Development workflow
- Testing strategy
- Business context

**agents.md Contents**:
- Multi-agent architecture (Orchestrator, Brainstorm, Automation, Frontend, Testing, Documentation)
- Agent responsibilities and activation triggers
- Parallel workflow examples
- Inter-agent communication protocols
- Decision trees for agent activation
- Success metrics

**changelog.md Contents**:
- This file - structured changelog format
- Entry template for future updates
- Instructions for when to add entries

**Files Created**:
- `/claude.md`
- `/agents.md`
- `/changelog.md`

**Testing**:
- Documentation reviewed for accuracy
- Code examples verified
- Workflow descriptions match Make.com scenarios

**Known Issues**: None

---

## 📋 Template for Future Entries

```markdown
### YYYY-MM-DD - Feature Name

**Added**:
- New feature 1
- New feature 2

**Changed**:
- Modified feature 1
- Modified feature 2

**Fixed**:
- Bug fix 1
- Bug fix 2

**Technical Details**:
- Implementation notes
- Files modified: [list]
- Dependencies added: [list]
- API changes: [list]

**Migration Notes** (if breaking changes):
```bash
# Migration commands
```

**Testing**: What was tested and verified

**Known Issues**: Any remaining issues or limitations
```

---

**End of changelog.md** - Add new entries at the top of this file!