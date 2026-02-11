# Add “inbound reply” branch to AH - Watch emails

When the customer (e.g. zimraana@allinit.com.au) **replies** to your support email, that reply should show in **Ticket Details** as a **Customer** speech bubble (different color) in the Email Thread, and **not** create a new ticket.

The app already shows:
- **Outbound** = “You” in an orange-tinted bubble
- **Inbound** = “Customer” in a grey bubble

You just need the Watch Emails flow to **add inbound replies** to `ticket_replies` instead of creating a new `support_tickets` row.

---

## Use conversationId (not In-Reply-To)

Microsoft Graph’s “Get an email” output **does not** expose **In-Reply-To** or **References** as top-level fields (they’re in MIME/singleValueExtendedProperties).  

It **does** expose **conversationId**, which is stable for the whole Outlook thread. So we:

1. **Store** `conversation_id` when creating a ticket (from the first email).
2. **Match** inbound emails by **conversationId** to find the ticket. No In-Reply-To needed.

---

## 1. Store conversation_id when creating a ticket

When you create a **new** ticket from an email (Supabase upsert into `support_tickets`), set:

- **conversation_id**: `{{6.conversationId}}`

(List messages / Search emails module 6 usually returns `conversationId` per message. If it doesn’t, the “Get an email” step you added also returns it; for the “new email” path you can use the same value from the message that created the ticket.)

Add the column if it’s not there yet (migration `20250211000001_support_tickets_conversation_id.sql` adds `conversation_id` to `support_tickets`).

---

## 2. Where to add the branch in Make.com

Your flow:

1. **5** Webhook → **6** List/Search messages → **12** Router  
2. Route “received date exists” → **7** Iterator (array = `6`) → for each email: **Get an email** (full message) → then either “reply” or “new ticket”

Add the “is this a reply?” logic **inside** the loop, **after** “Get an email” and **before** OpenAI:

1. Get full message (you already have this; output has **conversationId**).
2. If **conversationId** matches an existing ticket’s **conversation_id** → add to `ticket_replies` (inbound), mark read, **stop** (no new ticket).
3. Otherwise → run your existing path (OpenAI → support_tickets → mark read).

---

## 3. Step-by-step: what to add in Make.com

### 3.1 Get full message (you have this)

You already have **Microsoft 365 Email – Get an email** (message id = `{{6.id}}`). Call its output module **20** (or whatever id it has).

From your Get message output you have:

- **conversationId**: `AAQkAGFiMzJhMThjLWU4OTUtNDM2Zi05M2U2LTU0MGRiYzdjNjViZgAQAHD1UGswDgpInFBknigMW4E=`
- **body.content**: full HTML body
- **bodyPreview**: plain snippet
- **sender.emailAddress.address**: e.g. zimraana@allinit.com.au
- **from.emailAddress.address**: same
- **subject**: e.g. `RE: testing the automation watcher `
- **internetMessageId**: this email’s Message-ID
- **id**: Graph message id

No In-Reply-To is required; we use **conversationId** only.

---

### 3.2 Router: “Is this a reply?” (match by conversationId)

Add a **Router** with two routes **after** Get an email (20):

- **Route 1 – “Is reply”**  
  - **Filter**: only run if we will find a ticket (see below).  
  - In practice: first do a **Supabase – Search records** (see 3.3a) and then use a **Router** whose Route 1 runs when that search returns at least one row. So: **Supabase Search** support_tickets where **conversation_id** = `{{20.conversationId}}` (or `{{6.conversationId}}` if 6 has it), limit 1. Then Router: Route 1 = “ticket found” (e.g. length of search result &gt; 0), Route 2 = else (new email).

- **Route 2 – “New email”**  
  - No filter (or “else”).  
  - This path continues to your **existing** flow: **3** OpenAI → **4** Parse JSON → **2** Supabase support_tickets → mark read.

So the order is: **Get an email (20)** → **Supabase Search** by conversation_id → **Router** (reply vs new) → Reply branch or New-email branch.

---

### 3.3 “Is reply” branch: find ticket and add reply

On **Route 1** only (when a ticket was found by conversation_id), do the following.

**3.3a. Find ticket_id (by conversationId)**

- **Supabase – Search records**
  - Table: **support_tickets**
  - Filter: **conversation_id** = `{{20.conversationId}}`
  - Limit: 1

Use the **id** of the first record as **ticket_id**. (If you did this search before the Router to decide “reply vs new”, reuse that result here so you already have **ticket_id**.)

**3.3b. Add the reply (body = email body)**

Use **one** of these:

- **Option A – App API (recommended)**  
  Use **HTTP – Make a request** so Make.com sends the reply to your app. See **“HTTP request in Make.com”** below for the exact setup.

---

#### HTTP request in Make.com (Option A – exact steps)

1. Add the **HTTP** app → **Make a request**.
2. Configure:
   - **URL:**  
     `https://YOUR-APP-DOMAIN/api/add-ticket-reply`  
     Replace `YOUR-APP-DOMAIN` with your app’s real domain (e.g. `aiit-automation-hub.vercel.app` or your production URL). No trailing slash.
   - **Method:** `POST`
   - **Headers:**  
     - Name: `Content-Type`  
     - Value: `application/json`
   - **Body type:** Raw
   - **Request content:**  
     Choose **JSON** and paste the structure below, then **map** each value from your scenario (Supabase search result = ticket_id, Get an email = module 20).

**Body (JSON) – map the values in Make.com:**

| Key          | Value to map (example) |
|-------------|-------------------------|
| `ticket_id` | `{{21.id}}` (or the id from your Supabase “Search records” module – use that module’s number instead of 21) |
| `body`      | `{{20.body.content}}` |
| `body_plain`| `{{20.bodyPreview}}` |
| `from_email`| `{{20.from.emailAddress.address}}` |
| `subject`   | `{{20.subject}}` |
| `message_id`| `{{20.internetMessageId}}` |

Optional: `to_email` (e.g. first toRecipient), `cc`, `in_reply_to`, `references_header`.

**Example body (after mapping):**

```json
{
  "ticket_id": "{{21.id}}",
  "body": "{{20.body.content}}",
  "body_plain": "{{20.bodyPreview}}",
  "from_email": "{{20.from.emailAddress.address}}",
  "subject": "{{20.subject}}",
  "message_id": "{{20.internetMessageId}}"
}
```

Use your **actual** module numbers: **20** = “Get an email” output, **21** = Supabase “Search records” output (or whatever id your Search module has). The app will respond with `{ "success": true }` on success, or an error JSON and 4xx/5xx on failure.

---

- **Option B – Supabase**  
  - **Supabase – Insert record**
  - Table: **ticket_replies**
  - Fields:
    - **ticket_id**: from 3.3a  
    - **direction**: `inbound`  
    - **body**: `{{20.body.content}}`  
    - **body_plain**: `{{20.bodyPreview}}`  
    - **from_email**: `{{20.from.emailAddress.address}}`  
    - **to_email**: first toRecipient if you want (e.g. support@allinit.com.au)  
    - **subject**: `{{20.subject}}`  
    - **message_id**: `{{20.internetMessageId}}`

**3.3c. Mark email as read**

- Use the same **Microsoft 365 Email – Update a draft message** (or “Mark as read”) logic you use in the “new ticket” path: message id = `{{6.id}}`, set **isRead** = true.

After that, this run for that email is done (no new ticket).

---

### 3.4 “New email” branch (unchanged)

- **Route 2** of the Router goes to your **existing** flow: **3** OpenAI → **4** Parse JSON → **2** Supabase upsert into **support_tickets** (and then mark read / attachments). No changes there **except** in the Supabase upsert for **support_tickets**, add:
  - **conversation_id**: `{{6.conversationId}}` (or `{{20.conversationId}}` if you only have it from Get message in this path)

That way the next time someone replies in the same thread, their email will have the same **conversationId** and you’ll match it to this ticket.

---

## 4. Flow summary

- **5** Webhook → **6** List/Search messages → **12** Router (“received date exists”) → **7** Iterator (array = 6).  
- **For each email (6):**
  - **Get an email** (6.id) → output **20** with **conversationId**, **body**, **from**, **subject**, **internetMessageId**, etc.
  - **Supabase Search** support_tickets where **conversation_id** = `{{20.conversationId}}`, limit 1.
  - **Router “Reply or New?”**
    - **Reply (ticket found):** **ticket_id** = search result id → POST **/api/add-ticket-reply** (or Supabase insert **ticket_replies**) with **body** = `20.body.content`, **from_email** = `20.from.emailAddress.address`, **subject**, **message_id** = `20.internetMessageId` → mark read. **Done.**
    - **New (no ticket):** OpenAI → Parse → Supabase **support_tickets** (include **conversation_id** = `6.conversationId` or `20.conversationId`) → mark read (current flow).

---

## 5. Apply the migration (conversation_id column)

Run the migration that adds **conversation_id** to **support_tickets** (e.g. `20250211000001_support_tickets_conversation_id.sql`), or in Supabase SQL Editor:

```sql
alter table support_tickets add column if not exists conversation_id text;
create index if not exists support_tickets_conversation_id_idx on support_tickets(conversation_id) where conversation_id is not null;
```

---

## 6. Existing tickets (one-time backfill, optional)

Tickets created **before** you added **conversation_id** won’t have it. For those, replies can’t be matched by conversationId until you backfill. Options:

- Leave old tickets as-is; only new tickets (and their replies) will use conversationId.  
- Or run a one-time Make.com scenario (or script) that for each email ticket without conversation_id fetches the message by **email_message_id** / **id** and updates **support_tickets.conversation_id** from the message’s **conversationId** if available.

---

## 7. How it shows in the app

- When you add a row to **ticket_replies** with **direction** = **inbound**, the Ticket Detail page loads it with **tickets.getReplies**.
- The UI already renders:
  - **direction === 'outbound'** → “You” + orange-tinted bubble.
  - **direction === 'inbound'** → “Customer” + grey bubble.

So the customer’s reply will appear as the “speech bubble in a different color” (Customer) and will **not** create a new ticket.

---

## 8. Reference from your Get message output

From the payload you shared:

- **conversationId**: `AAQkAGFiMzJhMThjLWU4OTUtNDM2Zi05M2U2LTU0MGRiYzdjNjViZgAQAHD1UGswDgpInFBknigMW4E=`
- **subject**: `RE: testing the automation watcher `
- **body.content**: full HTML (includes “Okay thanks support team I appreciate it” and quoted previous message)
- **bodyPreview**: plain snippet
- **from.emailAddress.address**: `zimraana@allinit.com.au`
- **internetMessageId**: `<SYBPR01MB5776B8E6D64E447BF1B43485F763A@SYBPR01MB5776.ausprd01.prod.outlook.com>`

Use **conversationId** to find the ticket; use **body.content** (or **bodyPreview** for plain) for the reply text; use **from**, **subject**, **internetMessageId** for the other fields. No In-Reply-To needed.
