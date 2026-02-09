# AIIT Automation Hub - AI Development Guide

> **Last Updated**: 2026-02-09
> **Version**: 1.0.0
> **Auto-Update**: Enabled - Claude should update this file when context changes

---

## 🎯 Project Overview

AIIT Automation Hub is an internal business automation platform for All In IT Solutions that replaces manual Google Sheets workflows with custom-built dashboards. The flagship module is the **Debt Recovery Hub**, which automates client payment tracking, debt collection, and follow-up processes.

### Core Mission
- **Primary Goal**: Eliminate manual data entry and provide real-time visibility into client payment statuses
- **Target User**: Internal team at All In IT Solutions (CEO Ali Taufeek, Zimraan, team members)
- **Unique Value**: Unified hub approach - each business automation becomes a module with sophisticated backends
- **Business Model**: Internal tool first → White-label SaaS offering for accounting firms and businesses

### Current Status
- **Stage**: Active development - Debt Recovery Hub live in production
- **Team**: Zimraan (Full Stack AI Developer) + Ali Taufeek (CEO)
- **Live URL**: https://debt-recovery-hub-rho.vercel.app/
- **Current Users**: All In IT Solutions internal team
- **Next Milestone**: Complete bidirectional sync, expand to additional automation modules

---

## 🏗️ System Architecture

### Tech Stack
```typescript
// Frontend
- Framework: Next.js 14 (App Router)
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS (dark theme)
- UI Components: shadcn/ui + Lucide icons
- Data Fetching: tRPC (type-safe APIs)

// Backend
- Database: PostgreSQL via Supabase
- ORM: Prisma
- API: Next.js API Routes + tRPC
- Real-time: Supabase subscriptions
- Edge Functions: Supabase Edge Functions

// Automation Layer
- Workflow Engine: Make.com (primary) + n8n (alternative/future)
- Scheduling: Make.com built-in scheduler
- Webhooks: Bidirectional communication between automations and dashboard

// Infrastructure
- Hosting: Vercel (frontend + API routes)
- Database Hosting: Supabase (managed PostgreSQL)
- CDN: Vercel Edge Network
- Monitoring: Vercel Analytics (future: Sentry)

// External Integrations
- Xero API: Accounting data (invoices, contacts, payments)
- VAPI: AI-powered voice calling
- ElevenLabs: Voice synthesis for VAPI
- Twilio: SMS messaging
- Microsoft Graph: Outlook email sending
- Google Sheets API: Simpler automations (future modules)
```

### Architecture Philosophy

**Separation of Concerns**:
```
┌─────────────────────────────────────────────────────┐
│           FRONTEND (Viewing Layer)                  │
│  Next.js Dashboard - Display data, trigger actions │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├─── Real-time subscriptions
                   ├─── tRPC queries
                   └─── Webhook triggers
                   │
┌──────────────────▼──────────────────────────────────┐
│           BACKEND (Data Layer)                      │
│  Supabase Database - Store, query, serve data      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├─── UPSERT operations
                   ├─── Activity logging
                   └─── Status updates
                   │
┌──────────────────▼──────────────────────────────────┐
│      AUTOMATION LAYER (Business Logic)              │
│  Make.com/n8n - Process, calculate, orchestrate    │
│  • Xero sync                                        │
│  • Payment detection                                │
│  • Streak calculation                               │
│  • Outreach automation (VAPI, SMS, Email)           │
└─────────────────────────────────────────────────────┘
```

**Key Principle**: The dashboard is a **viewing layer only**. All business logic, calculations, and automation happen in Make.com/n8n workflows. The frontend displays what the automation layer decides.

---

## 📊 Database Schema (Prisma)

### Core Tables

```prisma
// prisma/schema.prisma

model Client {
  id              String   @id @default(cuid())
  xeroContactId   String   @unique @map("xero_contact_id")
  
  // Contact Information (synced from Xero)
  firstName       String   @map("first_name")
  lastName        String   @map("last_name")
  email           String?
  phoneNumber     String?  @map("phone_number")
  businessName    String   @map("business_name")
  
  // Financial Tracking
  currentBalance  Decimal  @default(0) @db.Decimal(10, 2) @map("current_balance")
  previousBalance Decimal  @default(0) @db.Decimal(10, 2) @map("previous_balance")
  
  // Streak Tracking (managed by automations)
  streakWeeks     Int      @default(0) @map("streak_weeks")
  lastPaymentDate DateTime? @map("last_payment_date")
  
  // Status Management
  status          String   @default("current") // current | warning | critical | suspended
  
  // Contact Tracking
  lastContactDate DateTime? @map("last_contact_date")
  lastCallOutcome String?  @map("last_call_outcome") // answered | voicemail | no_answer | failed
  
  // Timestamps
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  
  // Relations
  snapshots       WeeklySnapshot[]
  activities      ActivityLog[]
  
  @@map("clients")
}

model WeeklySnapshot {
  id          String   @id @default(cuid())
  clientId    String   @map("client_id")
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  
  weekStart   DateTime @map("week_start")
  balance     Decimal  @db.Decimal(10, 2)
  paymentMade Boolean  @default(false) @map("payment_made")
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([clientId, weekStart])
  @@map("weekly_snapshots")
}

model ActivityLog {
  id            String   @id @default(cuid())
  clientId      String   @map("client_id")
  client        Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  
  activityType  String   @map("activity_type") // call | sms | email | payment | suspension | sync
  outcome       String?  // For calls: answered | voicemail | no_answer
  recordingUrl  String?  @map("recording_url") // VAPI recording link
  notes         String?
  metadata      Json?    // Flexible field for extra data
  
  createdAt     DateTime @default(now()) @map("created_at")
  
  @@index([clientId, createdAt(sort: Desc)])
  @@index([activityType])
  @@map("activity_log")
}
```

---

## 🔄 Automation Workflows

### Make.com Workflows (Primary)

#### Workflow 1: Daily Xero Sync (Scheduled @ 6am)

**Purpose**: Sync all client contact information and current balances from Xero

**Trigger**: Schedule module (every day at 6:00 AM AEDT)

**Flow**:
```
1. Xero: GET /Invoices?Statuses=PAID,UNPAID
   └─> Get all invoices from last 24 hours
   
2. Iterator: Loop through each invoice
   └─> Extract: ContactID, ContactName, AmountDue, Total
   
3. Xero: GET /Contacts/{ContactID}
   └─> Get full contact details
   
4. Supabase Edge Function: POST /api/sync-xero
   └─> UPSERT client into database
       • UPDATE: firstName, lastName, email, phone, businessName, currentBalance
       • PRESERVE: streakWeeks, previousBalance, status, lastContactDate
       • CREATE: Initialize new client with defaults
       
5. HTTP Response: Return success/failure to Make.com
   └─> Log in Make.com execution history
```

**Critical Implementation Notes**:
```javascript
// UPSERT Logic (Edge Function)
const existingClient = await db.client.findUnique({
  where: { xeroContactId: xero_contact_id }
});

if (existingClient) {
  // UPDATE - preserve automation-managed fields
  await db.client.update({
    where: { id: existingClient.id },
    data: {
      firstName: xero_first_name,
      lastName: xero_last_name,
      email: xero_email,
      phoneNumber: xero_phone,
      businessName: xero_business_name,
      currentBalance: xero_balance,
      // DO NOT UPDATE:
      // - streakWeeks (managed by streak tracker)
      // - previousBalance (set by weekly snapshot)
      // - status (calculated by business logic)
      // - lastContactDate (set by outreach workflows)
    }
  });
} else {
  // CREATE - initialize with defaults
  await db.client.create({
    data: {
      xeroContactId: xero_contact_id,
      firstName: xero_first_name,
      lastName: xero_last_name,
      email: xero_email,
      phoneNumber: xero_phone,
      businessName: xero_business_name,
      currentBalance: xero_balance,
      previousBalance: xero_balance, // Initialize same as current
      streakWeeks: 0,
      status: 'current',
    }
  });
}
```

#### Workflow 2: Manual "Sync Now" Button

**Purpose**: User-triggered sync from dashboard

**Trigger**: Webhook from dashboard (user clicks "Sync Now" button)

**Flow**: Identical to Daily Xero Sync, but triggered on-demand

**Implementation**:
```typescript
// Frontend button (Dashboard)
async function handleSyncNow() {
  setLoading(true);
  try {
    const response = await fetch(MAKE_SYNC_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual_sync' })
    });
    
    if (response.ok) {
      toast.success('Sync started! Data will update in 30-60 seconds.');
    }
  } catch (error) {
    toast.error('Sync failed. Please try again.');
  } finally {
    setLoading(false);
  }
}
```

#### Workflow 3: Payment Watcher (Continuous Monitoring)

**Purpose**: Detect new payments in Xero and reset payment streaks

**Trigger**: Xero webhook (invoice.PAID event) OR Scheduled check (hourly/daily)

**Flow**:
```
1. Xero: GET /Invoices?Status=PAID&DateFrom={last_24_hours}
   └─> Get recently paid invoices
   
2. Iterator: Loop through each payment
   
3. For each payment:
   a. Xero: GET /Contacts/{ContactID}/Invoices
      └─> Get all invoices for this contact
      
   b. Calculate: Sum of AmountDue for unpaid invoices
      └─> new_balance = Σ(unpaid_invoices.AmountDue)
      
   c. Supabase: GET /api/client-by-xero-id?xero_id={ContactID}
      └─> Fetch existing client record
      
   d. Compare: new_balance vs. client.previousBalance
      
   e. IF new_balance < previousBalance:
      └─> Payment made! Reset streak
          • streakWeeks = 0
          • status = 'current'
          • lastPaymentDate = NOW()
          
   f. ELSE:
      └─> No effective payment (balance same/increased)
          • Keep streakWeeks unchanged
          
   g. Supabase: POST /api/update-payment
      └─> Update currentBalance, streakWeeks, status
      
   h. Supabase: POST /api/log-activity
      └─> Log: { activityType: 'payment_received', notes: 'Payment detected' }
```

**Critical Logic**:
```javascript
// Payment Detection Logic
if (new_balance < client.previousBalance) {
  // Payment made - reset streak
  await updateClient({
    currentBalance: new_balance,
    streakWeeks: 0,
    status: 'current',
    lastPaymentDate: new Date(),
  });
  
  await logActivity({
    clientId: client.id,
    activityType: 'payment_received',
    notes: `Balance reduced from $${client.previousBalance} to $${new_balance}`,
  });
} else {
  // No payment or balance increased
  await updateClient({
    currentBalance: new_balance,
    // streakWeeks unchanged
    // status unchanged
  });
}
```

#### Workflow 4: Weekly Streak Tracker (Every Monday @ 6:30am)

**Purpose**: Calculate payment streaks and update statuses

**Trigger**: Schedule module (every Monday at 6:30 AM - after Daily Xero Sync)

**Flow**:
```
1. Supabase: GET /api/clients-with-balance
   └─> Query: WHERE currentBalance > 0
   
2. Iterator: Loop through each client
   
3. For each client:
   a. Compare: currentBalance vs. previousBalance
   
   b. IF currentBalance >= previousBalance:
      └─> No payment this week
          • streakWeeks += 1
          • paymentMade = false
          
   c. ELSE:
      └─> Payment made this week
          • streakWeeks = 0
          • paymentMade = true
          
   d. Calculate new status:
      • streakWeeks 0-1: status = 'current' (green)
      • streakWeeks 2: status = 'warning' (amber)
      • streakWeeks >= 3: status = 'critical' (red)
      • streakWeeks >= 3 AND daysSincePayment >= 21: status = 'suspended' (gray)
      
   e. Supabase: POST /api/create-snapshot
      └─> Insert into weekly_snapshots:
          { clientId, weekStart, balance, paymentMade }
          
   f. Supabase: POST /api/update-client
      └─> Update:
          • previousBalance = currentBalance (prepare for next week)
          • streakWeeks (incremented or reset)
          • status (recalculated)
```

**Status Calculation**:
```javascript
function calculateStatus(streakWeeks, daysSinceLastPayment) {
  if (streakWeeks === 0 || streakWeeks === 1) {
    return 'current'; // Green - Good standing
  }
  if (streakWeeks === 2) {
    return 'warning'; // Amber - Needs attention
  }
  if (streakWeeks >= 3 && daysSinceLastPayment < 21) {
    return 'critical'; // Red - Urgent
  }
  if (streakWeeks >= 3 && daysSinceLastPayment >= 21) {
    return 'suspended'; // Gray - Services suspended
  }
  return 'current'; // Default fallback
}
```

#### Workflow 5: Monday Outreach Automation (Every Monday @ 9am)

**Purpose**: Automated debt collection outreach via AI calls, SMS, and email

**Trigger**: Schedule module (every Monday at 9:00 AM)

**Flow**:
```
1. Supabase: GET /api/clients-to-contact
   └─> Query: WHERE status IN ('warning', 'critical') AND currentBalance > 0
   
2. Iterator: Loop through each client needing contact
   
3. For each client:
   a. VAPI: POST /call
      └─> Payload: {
            phoneNumber: client.phoneNumber,
            assistantId: "debt_collection_assistant",
            context: {
              firstName: client.firstName,
              businessName: client.businessName,
              balance: client.currentBalance,
              streakWeeks: client.streakWeeks
            }
          }
      └─> VAPI makes AI-powered call
      └─> Response: { callId, status, recordingUrl }
      
   b. Wait: 2 seconds (rate limiting)
   
   c. Twilio: POST /Messages
      └─> Send SMS: "Hi {firstName}, friendly reminder about your 
          outstanding balance of ${balance}. Please call us at 
          [phone number]. - All In IT Solutions"
      └─> Response: { messageSid, status }
      
   d. Microsoft Graph: POST /me/sendMail
      └─> Send email with professional template
      └─> Include: Balance, payment options, contact info
      
   e. Supabase: POST /api/log-activity
      └─> Insert 3 activity log entries:
          • { activityType: 'call', recordingUrl, outcome: 'pending' }
          • { activityType: 'sms', notes: 'Reminder SMS sent' }
          • { activityType: 'email', notes: 'Payment reminder sent' }
          
   f. Supabase: POST /api/update-client
      └─> Update: lastContactDate = NOW()
```

**VAPI Configuration**:
```javascript
// VAPI Assistant Prompt
{
  "assistantId": "debt_collection_assistant",
  "voice": {
    "provider": "elevenlabs",
    "voiceId": "professional_male_aussie"
  },
  "prompt": `You are calling on behalf of All In IT Solutions regarding an outstanding payment.

Client Context:
- Name: {{firstName}}
- Business: {{businessName}}
- Outstanding Balance: ${{balance}}
- Weeks Overdue: {{streakWeeks}}

Your goal:
1. Politely inform them of the outstanding balance
2. Ask when they expect to make payment
3. Offer to set up a payment plan if needed
4. Stay professional and empathetic

If they commit to a payment date, confirm it back to them.
If they need more time, offer to have accounts team call them.
Always end on a positive, solution-focused note.`
}
```

#### Workflow 6: Suspension Tracker (Daily @ 7am)

**Purpose**: Identify clients for suspension and send final warnings

**Trigger**: Schedule module (every day at 7:00 AM)

**Flow**:
```
1. Supabase: GET /api/clients-at-risk
   └─> Query: WHERE status = 'critical' AND streakWeeks >= 3
   
2. Iterator: Loop through at-risk clients
   
3. For each client:
   a. Calculate: daysSinceLastPayment = NOW() - lastPaymentDate
   
   b. IF daysSinceLastPayment >= 21:
      └─> Suspension criteria met (3 weeks + 21 days)
      
      c. Microsoft Graph: POST /me/sendMail
         └─> Send FINAL NOTICE email:
             "Your services will be suspended in 48 hours 
             unless payment is received. Please contact us 
             urgently."
             
      d. Xero: PUT /Contacts/{ContactID}
         └─> Add note: "SUSPENDED: {date} - No payment for 21+ days"
         
      e. Supabase: POST /api/update-client
         └─> Update: status = 'suspended'
         
      f. Supabase: POST /api/log-activity
         └─> Log: {
               activityType: 'suspension',
               notes: 'Suspension warning sent - 48hr notice'
             }
```

### n8n Workflows (Alternative/Future)

n8n can be used as an alternative to Make.com or for specific workflows where more complex logic or self-hosting is beneficial.

**Example: n8n Daily Xero Sync**

```json
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.cron",
      "parameters": {
        "cronExpression": "0 6 * * *"
      }
    },
    {
      "name": "Xero Get Invoices",
      "type": "n8n-nodes-base.xero",
      "parameters": {
        "resource": "invoice",
        "operation": "getAll",
        "filters": {
          "status": ["PAID", "UNPAID"]
        }
      }
    },
    {
      "name": "Loop Invoices",
      "type": "n8n-nodes-base.splitInBatches"
    },
    {
      "name": "Xero Get Contact",
      "type": "n8n-nodes-base.xero",
      "parameters": {
        "resource": "contact",
        "operation": "get",
        "contactId": "={{$json.Contact.ContactID}}"
      }
    },
    {
      "name": "Supabase UPSERT",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": `
          INSERT INTO clients (xero_contact_id, first_name, last_name, ...)
          VALUES ($1, $2, $3, ...)
          ON CONFLICT (xero_contact_id) 
          DO UPDATE SET
            first_name = EXCLUDED.first_name,
            current_balance = EXCLUDED.current_balance,
            updated_at = NOW()
        `
      }
    }
  ]
}
```

**n8n Advantages**:
- Self-hosted option (more control)
- More complex JavaScript expressions
- Better for error handling with multiple paths
- Version control for workflows (JSON export)

**Make.com Advantages**:
- Faster to build (visual interface)
- Better Xero integration
- Built-in scheduling without server
- Easier for non-technical team members

---

## 🤖 Development Instructions for Claude

### General Principles

1. **Dashboard is Viewing Layer**
   - Never implement business logic in frontend
   - All calculations happen in Make.com/n8n
   - Frontend queries data and displays it
   - Frontend can trigger automation via webhooks

2. **UPSERT is Sacred**
   - Always preserve automation-managed fields when syncing from Xero
   - Update only: contact info (name, email, phone) and currentBalance
   - Preserve: streakWeeks, previousBalance, status, lastContactDate
   - Race conditions can corrupt data - be cautious

3. **Streak Logic is Core Business Value**
   ```typescript
   /**
    * Payment Streak Tracking
    * 
    * Why it matters:
    * - Core metric for debt collection priority
    * - Determines client status (current → critical → suspended)
    * - Drives automated outreach timing
    * 
    * How it works:
    * - Every Monday: Compare current_balance vs. previous_balance
    * - If balance decreased: streak = 0 (payment made)
    * - If balance same/increased: streak += 1 (no payment)
    * - Status calculated from streak:
    *   • 0-1 weeks: current (green)
    *   • 2 weeks: warning (amber)
    *   • 3+ weeks: critical (red)
    *   • 3+ weeks + 21 days: suspended (gray)
    * 
    * NEVER reset streaks incorrectly - this affects real businesses
    */
   ```

4. **Type Safety First**
   - All API inputs validated with Zod
   - All database operations use Prisma types
   - No `any` types - use `unknown` if truly uncertain
   - tRPC for type-safe API calls from frontend

5. **Error Handling is Critical**
   ```typescript
   // Every external call must have try/catch
   async function syncXeroContact(xeroContactId: string) {
     try {
       const contact = await xeroClient.contacts.get(xeroContactId);
       return contact;
     } catch (error) {
       // Log for debugging
       console.error('Xero sync failed:', error);
       
       // Log to activity table for auditing
       await db.activityLog.create({
         data: {
           activityType: 'sync_error',
           notes: `Failed to sync Xero contact ${xeroContactId}`,
           metadata: { error: String(error) }
         }
       });
       
       // User-friendly message
       throw new Error('Failed to sync client from Xero');
     }
   }
   ```

6. **Dark Theme by Default**
   - All UI uses dark theme color palette
   - Status colors must have proper contrast
   - Test in dark mode only

7. **Mobile-First Development**
   - Dashboard will be used on phones in the field
   - Touch targets minimum 44px
   - Responsive Tailwind classes: `sm:`, `md:`, `lg:`

---

## 🔧 Coding Standards

### TypeScript Usage

```typescript
// Always define types for complex objects
type Client = {
  id: string;
  xeroContactId: string;
  firstName: string;
  lastName: string;
  currentBalance: number;
  streakWeeks: number;
  status: 'current' | 'warning' | 'critical' | 'suspended';
};

// Use Zod for runtime validation
import { z } from 'zod';

const ClientSchema = z.object({
  xeroContactId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  currentBalance: z.number().nonnegative(),
});

// Infer TypeScript type from Zod schema
type ClientInput = z.infer<typeof ClientSchema>;

// Use interfaces for component props
interface ClientRowProps {
  client: Client;
  onContactClick: (clientId: string) => void;
}

// Avoid 'any' - use 'unknown' if needed
function processWebhookData(data: unknown) {
  const validated = ClientSchema.safeParse(data);
  if (!validated.success) {
    throw new Error('Invalid webhook data');
  }
  return validated.data;
}
```

### Component Structure (React/Next.js)

```typescript
// Preferred component structure
'use client'; // Only if needed (state, events)

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface ClientCardProps {
  client: Client;
  onUpdate: (id: string) => void;
}

/**
 * ClientCard - Displays debt collection client information
 * 
 * Shows:
 * - Client name and business
 * - Current balance (color-coded by status)
 * - Payment streak indicator
 * - Last contact date
 * - Quick action buttons
 * 
 * Color coding:
 * - Green: Current (0-1 week streak)
 * - Amber: Warning (2 week streak)
 * - Red: Critical (3+ week streak)
 * - Gray: Suspended (3+ weeks + 21 days)
 */
export function ClientCard({ client, onUpdate }: ClientCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  // Handlers
  const handleContact = async () => {
    setIsLoading(true);
    try {
      await triggerOutreach(client.id);
      onUpdate(client.id);
    } catch (error) {
      console.error('Contact failed:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper functions
  const getStatusColor = () => {
    const colors = {
      current: 'text-green-500',
      warning: 'text-amber-500',
      critical: 'text-red-500',
      suspended: 'text-gray-500',
    };
    return colors[client.status];
  };
  
  // Render
  return (
    <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">
            {client.firstName} {client.lastName}
          </h3>
          <p className="text-sm text-zinc-400">{client.businessName}</p>
        </div>
        <span className={`text-xl font-bold ${getStatusColor()}`}>
          {formatCurrency(client.currentBalance)}
        </span>
      </div>
      
      <div className="mt-4 flex items-center gap-2">
        <Button 
          onClick={handleContact}
          disabled={isLoading}
          size="sm"
        >
          {isLoading ? 'Contacting...' : 'Contact Now'}
        </Button>
      </div>
    </div>
  );
}
```

### API Route Pattern

```typescript
// src/app/api/sync-xero/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { z } from 'zod';

// Input validation schema
const SyncSchema = z.object({
  xero_contact_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email().optional(),
  phone_number: z.string().optional(),
  business_name: z.string(),
  current_balance: z.number().nonnegative(),
});

/**
 * POST /api/sync-xero
 * 
 * Webhook endpoint called by Make.com Daily Xero Sync workflow
 * 
 * CRITICAL: This endpoint uses UPSERT logic to preserve automation-managed fields
 * - UPDATE: Contact info from Xero (name, email, phone, balance)
 * - PRESERVE: streakWeeks, previousBalance, status, lastContactDate
 * 
 * Why UPSERT matters:
 * - Prevents race conditions between Xero sync and streak tracker
 * - Ensures automation-calculated fields aren't overwritten
 * - Maintains data integrity for business logic
 */
export async function POST(req: NextRequest) {
  try {
    // Parse and validate input
    const body = await req.json();
    const data = SyncSchema.parse(body);
    
    // UPSERT into database
    const client = await db.client.upsert({
      where: { 
        xeroContactId: data.xero_contact_id 
      },
      update: {
        // Update contact info from Xero
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phoneNumber: data.phone_number,
        businessName: data.business_name,
        currentBalance: data.current_balance,
        // CRITICAL: Do NOT update these fields
        // - streakWeeks (managed by streak tracker)
        // - previousBalance (set by weekly snapshot)
        // - status (calculated by business logic)
        // - lastContactDate (set by outreach automation)
      },
      create: {
        // Create new client with defaults
        xeroContactId: data.xero_contact_id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phoneNumber: data.phone_number,
        businessName: data.business_name,
        currentBalance: data.current_balance,
        previousBalance: data.current_balance, // Initialize same as current
        streakWeeks: 0,
        status: 'current',
      },
    });
    
    // Log successful sync
    await db.activityLog.create({
      data: {
        clientId: client.id,
        activityType: 'sync',
        notes: 'Client synced from Xero',
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      client_id: client.id 
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    
    // Log error for debugging
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to sync client' },
      { status: 500 }
    );
  }
}
```

---

## 🎨 Design System (Use Frontend Design Skill)

### Color Palette (Dark Theme)

```css
/* Background Colors */
--background: #0a0a0a;           /* Main background */
--card-background: #141414;       /* Card backgrounds */
--border: #252525;                /* Borders */

/* Text Colors */
--text-primary: #e5e5e5;          /* Primary text */
--text-muted: #737373;            /* Muted/secondary text */

/* Status Colors */
--status-current: #10b981;        /* Green - Good standing */
--status-warning: #f59e0b;        /* Amber - Needs attention */
--status-critical: #ef4444;       /* Red - Urgent */
--status-suspended: #6b7280;      /* Gray - Suspended */

/* Accent Colors */
--accent-primary: #3b82f6;        /* Blue - Primary actions */
--accent-success: #10b981;        /* Green - Success states */
--accent-danger: #ef4444;         /* Red - Danger actions */
```

### Typography

```css
/* Font Stack */
--font-sans: system-ui, -apple-system, sans-serif;
--font-mono: 'Fira Code', monospace;

/* Font Sizes */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
--text-3xl: 1.875rem;   /* 30px */
--text-4xl: 2.25rem;    /* 36px */
```

### Component Guidelines

```typescript
// Use shadcn/ui components as base
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Status Badge Pattern
function StatusBadge({ status }: { status: Client['status'] }) {
  const variants = {
    current: 'bg-green-500/10 text-green-500 border-green-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    suspended: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };
  
  const labels = {
    current: 'Current',
    warning: 'Warning',
    critical: 'Critical',
    suspended: 'Suspended',
  };
  
  return (
    <Badge className={variants[status]}>
      {labels[status]}
    </Badge>
  );
}

// Consistent spacing (4px grid)
<div className="p-4 gap-4 space-y-4">
  {/* 16px padding, gap, and spacing */}
</div>

// Interactive states
<Button className="hover:bg-zinc-800 active:bg-zinc-700 transition-colors">
  Click me
</Button>
```

---

## 📊 Features & Priorities

### ✅ Implemented Features
- [x] Supabase database with clients, weekly_snapshots, activity_log tables
- [x] Prisma ORM integration
- [x] tRPC API layer for type-safe queries
- [x] Dashboard layout with stats cards
- [x] Client table with search/filter
- [x] Status badges (current/warning/critical/suspended)
- [x] Make.com Daily Xero Sync workflow
- [x] Make.com Manual Sync Now webhook
- [x] Make.com Payment Watcher workflow
- [x] Make.com Weekly Streak Tracker workflow
- [x] Make.com Monday Outreach workflow (VAPI + Twilio + Outlook)
- [x] Make.com Suspension Tracker workflow
- [x] UPSERT logic preserving automation-managed fields
- [x] Real-time balance tracking from Xero
- [x] Payment streak calculation
- [x] Activity logging

### 🚧 In Progress
- [ ] Bidirectional sync (frontend edits → Google Sheets)
- [ ] Quote status updates (sent → won)
- [ ] Client detail drawer with activity timeline
- [ ] Payment history charts
- [ ] Manual action buttons (call/email/SMS from dashboard)

### 📋 Backlog (AIIT Automation Hub Expansion)
- [ ] Module 2: Inventory Management (Xero inventory tracking)
- [ ] Module 3: Project Time Tracking (sync to Xero)
- [ ] Module 4: Invoice Generation Automation
- [ ] Module 5: Customer Onboarding Workflow
- [ ] Unified sidebar navigation for all modules
- [ ] Google Sheets integration for simpler automations
- [ ] Multi-user authentication (NextAuth.js)
- [ ] Role-based permissions (admin vs. viewer)
- [ ] Email template customization
- [ ] PDF export for reports
- [ ] Webhook logs and monitoring dashboard

---

## 🔄 Self-Updating Instructions

**Claude: Update this file whenever:**

1. **New Make.com/n8n workflow added**
   ```markdown
   Update: Added Workflow 7 - Customer Satisfaction Survey
   Date: 2026-02-09
   Reason: Automated post-payment satisfaction tracking
   Trigger: Webhook from payment detection
   ```

2. **Database schema changes**
   - Update Prisma schema section
   - Note migration requirements
   - Document new fields and their purposes

3. **New automation module added**
   - Add to "Features & Priorities" → "In Progress"
   - Document integration points
   - Update architecture diagram if needed

4. **API endpoints added/changed**
   - Document in appropriate workflow section
   - Include example requests/responses
   - Note authentication requirements

5. **Business logic changes**
   - Update workflow descriptions
   - Revise status calculation logic
   - Document edge cases and decisions

**Update Format:**
```markdown
## 📝 Recent Updates

### 2026-02-09 - Bidirectional Sync Implementation
- **What Changed**: Frontend can now update Google Sheets via API
- **Why**: Allow quote status changes from dashboard
- **Technical Notes**: Uses Google Sheets API v4, OAuth 2.0
- **Files Modified**: 
  - `/app/api/update-sheet/route.ts` (new)
  - `/server/api/routers/quotes.ts` (modified)
  - `/lib/google-sheets.ts` (new)

### 2026-02-08 - Payment Watcher Fix
- **What Changed**: Fixed streak reset logic to handle partial payments
- **Why**: Clients were not getting credit for partial payments
- **Bug Fix**: Changed comparison from `==` to `<` for balance decrease
- **Workflow Updated**: Make.com Workflow 3 - Payment Watcher
```

---

## 🚨 Common Pitfalls & Solutions

### 1. UPSERT Race Conditions

**Problem**: Xero sync overwrites streak_weeks calculated by streak tracker

```typescript
// ❌ WRONG - overwrites automation fields
await db.client.update({
  where: { xeroContactId: xero_id },
  data: {
    firstName: xero_data.first_name,
    streakWeeks: 0, // ❌ DON'T DO THIS
  }
});

// ✅ CORRECT - preserves automation fields
await db.client.update({
  where: { xeroContactId: xero_id },
  data: {
    firstName: xero_data.first_name,
    // streakWeeks intentionally omitted
  }
});
```

### 2. Date Handling in Make.com

**Problem**: Timestamp calculations fail due to milliseconds vs. seconds

```javascript
// ❌ WRONG - JavaScript Date expects milliseconds
const date = new Date(timestamp); // If timestamp is in seconds, this fails

// ✅ CORRECT - Check if timestamp is in seconds, convert to milliseconds
const timestamp_ms = timestamp < 10000000000 
  ? timestamp * 1000  // Convert seconds to milliseconds
  : timestamp;        // Already milliseconds
const date = new Date(timestamp_ms);
```

### 3. Environment Variables in Next.js

```bash
# ❌ WRONG - client-side env vars need NEXT_PUBLIC_ prefix
XERO_CLIENT_ID="abc123"  # Not accessible in browser

# ✅ CORRECT
NEXT_PUBLIC_XERO_CLIENT_ID="abc123"  # Accessible client-side
XERO_CLIENT_SECRET="secret123"        # Server-only (no prefix)
```

### 4. Supabase Client vs. Server

```typescript
// ❌ WRONG - using server client in client component
'use client'
import { createClient } from '@/lib/supabase/server';

// ✅ CORRECT - use browser client
'use client'
import { createClient } from '@/lib/supabase/client';

// ✅ CORRECT - use server client in Server Components
// (no 'use client' directive)
import { createClient } from '@/lib/supabase/server';
```

### 5. Make.com Error Handlers

**Problem**: HTTP notifications don't fire when using "Ignore" error handler

```
❌ WRONG Flow:
Xero API → [Ignore Error] → HTTP Response
(If error occurs, HTTP never runs)

✅ CORRECT Flow:
Xero API → [Resume Error Handler] → HTTP Response
(Error or success, HTTP always runs with status)
```

**Implementation**:
```
In Make.com:
1. Right-click module → "Add error handler" → "Resume"
2. Connect Resume to HTTP Response module
3. HTTP Response receives either success data OR error info
4. Always notify dashboard of outcome
```

---

## 🔗 Integration Notes

### Xero API

```typescript
/**
 * Xero Integration Pattern
 * 
 * Authentication: OAuth 2.0
 * Token Storage: Database (encrypted)
 * Token Refresh: Automatic (before expiry)
 * 
 * Rate Limits:
 * - 60 requests per minute per tenant
 * - 5,000 requests per day per tenant
 * 
 * Best Practices:
 * - Cache contact data in Supabase
 * - Only sync when needed (daily + webhooks)
 * - Use batch operations where possible
 * - Implement exponential backoff on rate limits
 */

// Example: Xero Client Setup
import { XeroClient } from 'xero-node';

const xero = new XeroClient({
  clientId: process.env.XERO_CLIENT_ID!,
  clientSecret: process.env.XERO_CLIENT_SECRET!,
  redirectUris: ['http://localhost:3000/api/xero/callback'],
  scopes: 'accounting.contacts accounting.transactions'.split(' '),
});

// Refresh token before each request
async function getXeroClient() {
  const tokenSet = await db.xeroToken.findFirst();
  
  if (!tokenSet) {
    throw new Error('No Xero token found. Please authenticate.');
  }
  
  // Check if token expired
  if (tokenSet.expires_at < new Date()) {
    const newTokenSet = await xero.refreshToken(tokenSet.refresh_token);
    
    // Save new tokens
    await db.xeroToken.update({
      where: { id: tokenSet.id },
      data: {
        access_token: newTokenSet.access_token,
        refresh_token: newTokenSet.refresh_token,
        expires_at: new Date(Date.now() + newTokenSet.expires_in * 1000),
      },
    });
  }
  
  xero.setTokenSet(tokenSet);
  return xero;
}
```

### VAPI (AI Voice Calls)

```typescript
/**
 * VAPI Integration Pattern
 * 
 * Use Case: Automated debt collection calls
 * Voice: ElevenLabs professional Australian male
 * 
 * Call Flow:
 * 1. Make.com triggers VAPI with client context
 * 2. VAPI makes call using AI assistant
 * 3. Call completes → webhook to Make.com
 * 4. Make.com logs outcome and recording URL
 * 
 * Important:
 * - Always include client context in metadata
 * - Recording URLs expire after 30 days
 * - Download and store in Supabase Storage if needed long-term
 */

// Example: VAPI Call Request
const response = await fetch('https://api.vapi.ai/call', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phoneNumber: client.phoneNumber,
    assistantId: process.env.VAPI_ASSISTANT_ID,
    metadata: {
      clientId: client.id,
      firstName: client.firstName,
      businessName: client.businessName,
      balance: client.currentBalance,
      streakWeeks: client.streakWeeks,
    },
  }),
});

const { callId, status } = await response.json();
```

### Twilio (SMS)

```typescript
/**
 * Twilio Integration Pattern
 * 
 * Use Case: Payment reminder SMS
 * 
 * Best Practices:
 * - Use message templates to avoid spam detection
 * - Include opt-out instructions (required by law)
 * - Track delivery status
 * - Respect quiet hours (8am-8pm)
 * - Format Australian numbers correctly (+61...)
 */

import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendPaymentReminder(clientData: Client) {
  // Format Australian phone number
  const formattedPhone = clientData.phoneNumber.startsWith('+61')
    ? clientData.phoneNumber
    : `+61${clientData.phoneNumber.replace(/^0/, '')}`;
  
  const message = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formattedPhone,
    body: `Hi ${clientData.firstName}, this is a friendly reminder about your outstanding balance of $${clientData.currentBalance}. Please contact us at 1300 XXX XXX. Reply STOP to opt out. - All In IT Solutions`,
  });
  
  return message.sid;
}
```

### Microsoft Graph (Outlook Email)

```typescript
/**
 * Microsoft Graph Integration Pattern
 * 
 * Use Case: Professional email reminders
 * Authentication: App-only (daemon app)
 * 
 * Email Template Strategy:
 * - HTML emails with inline CSS
 * - Mobile-responsive design
 * - Clear call-to-action buttons
 * - Professional branding (logo, colors)
 */

import { Client } from '@microsoft/microsoft-graph-client';

const graphClient = Client.init({
  authProvider: async (done) => {
    // Get access token using client credentials
    const token = await getGraphAccessToken();
    done(null, token);
  },
});

async function sendPaymentReminderEmail(clientData: Client) {
  const emailTemplate = `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Reminder</h2>
        <p>Dear ${clientData.firstName},</p>
        <p>This is a friendly reminder about your outstanding balance:</p>
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <h3 style="margin: 0; color: #ef4444;">$${clientData.currentBalance.toFixed(2)}</h3>
          <p style="margin: 5px 0 0 0; color: #666;">Current Balance</p>
        </div>
        <p>Please arrange payment at your earliest convenience.</p>
        <p>If you have any questions, please contact us at accounts@allinitsolutions.com.au</p>
        <p>Best regards,<br>All In IT Solutions</p>
      </body>
    </html>
  `;
  
  const message = {
    subject: `Payment Reminder - $${clientData.currentBalance.toFixed(2)} Outstanding`,
    body: {
      contentType: 'HTML',
      content: emailTemplate,
    },
    toRecipients: [
      {
        emailAddress: {
          address: clientData.email,
        },
      },
    ],
  };
  
  await graphClient
    .api('/me/sendMail')
    .post({ message });
}
```

---

## 📱 Mobile Considerations

### Responsive Design Principles

```typescript
/**
 * Mobile-First Breakpoints (Tailwind)
 * 
 * Default: Mobile (320px+)
 * sm: 640px+ (large phones)
 * md: 768px+ (tablets)
 * lg: 1024px+ (laptops)
 * xl: 1280px+ (desktops)
 */

// Example: Responsive client table
<table className="w-full">
  {/* Mobile: Stack columns vertically */}
  <tbody className="space-y-2 md:space-y-0">
    <tr className="flex flex-col md:table-row border-b border-zinc-800">
      <td className="p-4">
        {/* Client name visible on all screens */}
        <div className="font-semibold">{client.name}</div>
        {/* Business name hidden on mobile */}
        <div className="text-sm text-zinc-400 hidden sm:block">
          {client.businessName}
        </div>
      </td>
      {/* Balance */}
      <td className="p-4 md:text-right">
        <span className="text-xl font-bold">{formatCurrency(client.balance)}</span>
      </td>
    </tr>
  </tbody>
</table>
```

### Touch Interactions

```typescript
/**
 * Touch Target Guidelines
 * 
 * Minimum size: 44px x 44px (Apple HIG, Material Design)
 * Recommended: 48px x 48px
 * Spacing: 8px between targets
 */

// ❌ TOO SMALL - hard to tap on mobile
<button className="p-1 text-sm">
  Contact
</button>

// ✅ PROPER SIZE - easy to tap
<button className="p-3 min-h-[44px] min-w-[44px]">
  Contact
</button>
```

---

## 🧪 Testing Strategy

### Manual Testing Checklist

**Dashboard Functionality**:
- [ ] Stats cards display correct totals
- [ ] Client table shows all clients
- [ ] Search filters clients correctly
- [ ] Status badges show correct colors
- [ ] Sort by balance/streak works
- [ ] Sync Now button triggers Make.com webhook
- [ ] Loading states appear during data fetch
- [ ] Error messages display on API failures

**Make.com Workflows**:
- [ ] Daily Xero Sync runs at 6am AEDT
- [ ] Manual Sync Now pulls all Xero contacts
- [ ] Payment Watcher detects new payments
- [ ] Streak tracker runs every Monday 6:30am
- [ ] Monday Outreach triggers calls/SMS/emails
- [ ] Suspension Tracker sends warnings after 21 days
- [ ] All workflows log to activity_log table
- [ ] Error handlers fire HTTP notifications

**Business Logic**:
- [ ] UPSERT preserves streak_weeks
- [ ] Payment detection resets streak correctly
- [ ] Status calculation matches business rules
- [ ] Weekly snapshot creates historical record
- [ ] previousBalance updates every Monday

**Edge Cases**:
- [ ] New client added to Xero appears after sync
- [ ] Client makes payment → streak resets to 0
- [ ] Client makes multiple payments in one week
- [ ] Client goes 3 weeks without payment → status critical
- [ ] Client suspended then pays → status returns to current
- [ ] Duplicate Xero contacts handled (unique constraint)
- [ ] Missing email/phone doesn't break outreach
- [ ] Invalid phone numbers logged as failed contact

### Automated Testing (Future)

```typescript
// Example: Unit test for status calculation
describe('calculateStatus', () => {
  it('returns current for 0-1 week streak', () => {
    expect(calculateStatus(0, 5)).toBe('current');
    expect(calculateStatus(1, 10)).toBe('current');
  });
  
  it('returns warning for 2 week streak', () => {
    expect(calculateStatus(2, 14)).toBe('warning');
  });
  
  it('returns critical for 3+ week streak (< 21 days)', () => {
    expect(calculateStatus(3, 18)).toBe('critical');
  });
  
  it('returns suspended for 3+ weeks and 21+ days', () => {
    expect(calculateStatus(3, 21)).toBe('suspended');
    expect(calculateStatus(4, 25)).toBe('suspended');
  });
});
```

---

## 📚 Learning Resources for Zimraan

### Recommended Reading
- [Next.js 14 Docs](https://nextjs.org/docs) - App Router patterns
- [Prisma Docs](https://www.prisma.io/docs) - ORM best practices
- [tRPC Docs](https://trpc.io/docs) - Type-safe APIs
- [Make.com Academy](https://www.make.com/en/academy) - Automation patterns
- [n8n Docs](https://docs.n8n.io/) - Workflow automation
- [Xero API Docs](https://developer.xero.com/documentation/) - Accounting integration
- [VAPI Docs](https://docs.vapi.ai/) - Voice AI integration

### Debugging Tips

```typescript
// Verbose logging for development
console.log('🔍 Debug:', { 
  variable, 
  state, 
  props,
  timestamp: new Date().toISOString() 
});

// Use debugger in API routes
export async function POST(req: NextRequest) {
  debugger; // Pauses execution in dev tools
  const body = await req.json();
  // ...
}

// Prisma query logging
const client = await db.client.findUnique({
  where: { id: 'abc123' }
});
console.table(client); // Pretty print in console

// Make.com debugging
// Add "Text Parser" module to view exact data structure
// Use "Set Variable" to store values for inspection
// Check execution history for full request/response logs
```

---

## 🎯 Business Context (Important!)

### Why This Project Exists

**Problem Solved**:
- Manual Google Sheets tracking is error-prone and slow
- No real-time visibility into client payment statuses
- Debt collection relies on memory and manual follow-up
- Hard to identify at-risk clients before they become bad debts

**Solution Provided**:
- Real-time dashboard showing all client balances and payment streaks
- Automated outreach (calls, SMS, emails) for at-risk clients
- Clear status indicators (current → warning → critical → suspended)
- Historical tracking for payment patterns
- Scalable foundation for future automation modules

### Success Metrics

**Internal Use**:
- Time saved: 75% reduction in debt collection admin (target: 10 hours/week → 2.5 hours/week)
- Collection rate: Increase from 60% to 80%+ (more clients paying on time)
- Bad debt reduction: Fewer clients reaching suspended status
- Visibility: Real-time dashboard vs. weekly spreadsheet reviews

**Future SaaS Product**:
- Target market: Accounting firms, service businesses with recurring clients
- Pricing model: $49-$99/month per organization
- Value proposition: "Automated debt collection that pays for itself in one recovered invoice"
- Competitive advantage: Integration with Xero + AI voice calls + affordable pricing

---

## 🤝 Communication Style

When working with Zimraan:
- **Explain the "why"** - Business context matters
- **Provide examples** - Show code patterns with detailed comments
- **Suggest alternatives** - Present pros/cons for different approaches
- **Ask clarifying questions** - Avoid assumptions about requirements
- **Celebrate progress** - Building complex systems is challenging
- **Document decisions** - Update this file when architecture changes

---

## 📞 External Resources

- **Design Inspiration**: [Dribbble - Dashboard Designs](https://dribbble.com/tags/dashboard)
- **Component Library**: [shadcn/ui](https://ui.shadcn.com)
- **Icon Library**: [Lucide Icons](https://lucide.dev)
- **Color Palettes**: [Tailwind Colors](https://tailwindcss.com/docs/customizing-colors)
- **Automation Examples**: [Make.com Templates](https://www.make.com/en/templates)

---

## 🔐 Security Reminders

1. **Never commit secrets** - Use `.env.local` (gitignored)
2. **Validate all inputs** - Use Zod for API route validation
3. **Use RLS policies** - Supabase Row Level Security (when adding auth)
4. **Sanitize outputs** - Prevent XSS attacks (React escapes by default)
5. **Rate limit APIs** - Prevent abuse on webhook endpoints
6. **Encrypt sensitive data** - Xero tokens, API keys in database
7. **Use HTTPS** - Required for Xero OAuth, VAPI webhooks
8. **Audit logs** - Track all client updates in activity_log

---

## ✅ Pre-Deployment Checklist

Before pushing to production:
- [ ] All environment variables set in Vercel
- [ ] Database migrations applied to production Supabase
- [ ] Make.com workflows updated with production webhook URLs
- [ ] Xero OAuth configured with production redirect URI
- [ ] VAPI assistant configured with production phone number
- [ ] Twilio phone number verified and tested
- [ ] Microsoft Graph app registered with production permissions
- [ ] Error tracking configured (Vercel, Sentry, or similar)
- [ ] Supabase Row Level Security policies enabled (when auth added)
- [ ] Mobile responsiveness verified on real devices
- [ ] Manual test of complete flow: Xero → Sync → Dashboard display
- [ ] Backup strategy for Supabase database

---

## 📈 Roadmap & Vision

### Phase 1: Debt Recovery Hub (CURRENT)
- ✅ Core dashboard with real-time data
- ✅ Make.com automations (Xero, VAPI, Twilio, Outlook)
- 🚧 Bidirectional sync (frontend → Google Sheets)
- 🚧 Client detail views with activity timeline

### Phase 2: AIIT Automation Hub
- [ ] Unified sidebar navigation
- [ ] Module architecture (pluggable automation modules)
- [ ] Google Sheets integration for simpler automations
- [ ] Multi-user authentication and permissions

### Phase 3: Additional Modules
- [ ] Inventory Management Module
- [ ] Project Time Tracking Module
- [ ] Invoice Generation Module
- [ ] Customer Onboarding Module

### Phase 4: White-Label SaaS
- [ ] Multi-tenancy support
- [ ] Branding customization
- [ ] Pricing tiers and billing (Stripe)
- [ ] Customer portal
- [ ] API access for custom integrations

---

**End of claude.md** - Keep this file updated as the project evolves!