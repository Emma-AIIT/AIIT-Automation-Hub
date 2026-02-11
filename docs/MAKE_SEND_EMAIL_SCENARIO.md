# Make.com: Send email scenario (ticket reply)

This scenario is **triggered by the app** when a team member clicks **Send reply** in a ticket. It receives the reply payload and sends the email from your support inbox (Outlook).

**Blueprint:** A reference JSON is in `docs/make-scenarios/ah-send-ticket-reply-blueprint.json`. You can try importing it; if the Microsoft “Send” module name differs in your Make.com region, build the flow manually using the steps below (recommended).

---

## 1. Create the scenario

1. In Make.com, **Create a new scenario**.
2. Name it e.g. **AH - Send ticket reply email**.

---

## 2. Trigger: Custom webhook

1. Add the **Webhooks** app.
2. Choose **Custom webhook**.
3. Click **Add** to create a new webhook.
4. **Webhook name:** e.g. `AH - Send ticket reply`.
5. Leave **Parse response** and other options as default. Save.
6. Copy the **Webhook URL** — you will put this in your app as `MAKE_SEND_EMAIL_WEBHOOK_URL`.

The webhook will receive a **POST** with JSON body from the app:

```json
{
  "ticket_id": "uuid",
  "reply_id": "uuid",
  "to": "customer@example.com",
  "subject": "Re: Original subject",
  "body": "Reply text or HTML",
  "body_plain": "Optional plain text",
  "cc": "optional@cc.com",
  "message_id": "<ticket-uuid-timestamp@reply.aiit>",
  "in_reply_to": "<original-message-id>",
  "references": "<id1> <id2> ..."
}
```

---

## 3. Action: Microsoft 365 Email – send the email

1. Add the **Microsoft 365 Email (Outlook)** app.
2. Use the **same connection** as your inbound scenario: **support@allinit.com.au**.
3. Choose the action that sends an email. In the UI this is usually:
   - **Create and Send a Message**, or
   - **Create a Draft Email** followed by **Send a Draft Message**.

### Option A: One step – “Create and Send a Message” / “Send a Message”

If your Microsoft 365 Email app has a single action that sends immediately, use it and map:

| Module field | Map from |
|--------------|----------|
| **To**       | `1.to` (webhook body; may need to be array: one recipient with address = `1.to`) |
| **Subject**  | `1.subject` |
| **Body / Content** | `1.body` |
| **Body content type** | **HTML** if your app sends HTML, else **Text** |
| **CC**       | `1.cc` (if your module accepts CC; you may need to parse comma‑separated into an array) |

Optional (if the module has **Internet message headers** or **Single value extended properties**):

- **In-Reply-To**: `1.in_reply_to`
- **References**: `1.references`
- **Message-ID**: `1.message_id`

If there is no way to set custom headers, leave them blank. Threading can still work in many clients from **Subject** (Re: …) and **To**/reply behaviour.

### Option B: Two steps – “Create a Draft Email” then “Send a Draft Message”

If there is no single “Create and Send” action:

1. **Create a Draft Email**  
   Map: **To** = `1.to`, **Subject** = `1.subject`, **Body/Content** = `1.body`, **Body content type** = HTML (or Text).  
   This step returns a **message ID** (e.g. `2.id`).

2. **Send a Draft Message**  
   Map: **Message/Email ID** = `2.id` (the draft from step 1).

No need to map CC or headers for a first version; you can add them later.

### To recipient format (Microsoft Graph)

Microsoft Email in Make often expects **To** as an array of objects, e.g.:

```json
[{ "address": "email@example.com", "name": "" }]
```

- **Address:** `1.to`
- **Name:** leave empty or use a label like `Customer`

So in the mapper you might have:

- **To** → add one item: **Email address** = `1.to`, **Name** = (empty).

### CC (optional)

If the app sends `cc` (comma‑separated), and the module has a CC field:

- Either map the whole string to CC if the module accepts it, or
- Use a **Tools > Set multiple variables** or **Iterator** to split by comma and build a CC array. For a first version you can leave CC unmapped and add it later.

---

## 4. Respond to the webhook (recommended)

So the app gets a clear success/failure:

1. Add **Webhooks > Respond to webhook**.
2. **Status:** `200`
3. **Body:** e.g. `{ "success": true }` or leave default.

If you don’t respond, the app may still treat the run as success as long as the scenario doesn’t error.

---

## 5. Error handling (optional)

1. On the Microsoft Email module, open **Show advanced settings** (or the error hand icon).
2. Add **Error handler**:
   - **Webhooks > Respond to webhook**
   - **Status:** `500`
   - **Body:** `{ "success": false, "error": "{{2.error.message}}" }` (use the correct module number for the send step).

Then when sending fails, the app receives 500 and can show an error.

---

## 6. Connect the app

1. In your app’s `.env`, set:
   ```env
   MAKE_SEND_EMAIL_WEBHOOK_URL=https://hook.eu2.make.com/xxxxxxxxxxxx
   ```
   Use the **exact** webhook URL from step 2 (same region, e.g. eu2, as your other scenarios).

2. Redeploy or restart the app so it uses the new env.

---

## 7. Test

1. In Make.com, turn the scenario **ON** (scheduling can be “Immediately” or “Only when webhook is called”).
2. In your app, open an **email** ticket and use **Send reply** with a short message.
3. Check:
   - Make.com: one run, no errors.
   - Customer inbox: reply received, same thread if possible (Subject “Re: …” and, if you mapped them, correct headers).
4. If the app shows “Failed to send email”, check the Make.com run and the Respond to webhook status/body.

---

## Quick reference: webhook payload (from app)

| Field          | Description |
|----------------|-------------|
| `ticket_id`    | Ticket UUID |
| `reply_id`    | Reply record UUID |
| `to`          | Customer email (single address) |
| `subject`     | Re: &lt;original subject&gt; |
| `body`        | Reply body (HTML or plain) |
| `body_plain`  | Optional plain text |
| `cc`          | Optional CC (string) |
| `message_id`   | For threading |
| `in_reply_to` | Previous message Message-ID |
| `references`  | Space-separated Message-IDs |

Use the same **Microsoft 365 Email** connection as in **AH - Watch emails to create tickets** (support@allinit.com.au) so replies go from the same mailbox and threading is consistent.

---

## If the blueprint fails to import

The JSON in `docs/make-scenarios/ah-send-ticket-reply-blueprint.json` uses a Microsoft “send” module name that may differ in your Make.com region. If import fails or the Microsoft step is missing:

1. Create a **new scenario** and add **Webhooks > Custom webhook** as the trigger (create a new webhook and copy its URL into `MAKE_SEND_EMAIL_WEBHOOK_URL`).
2. Add **Microsoft 365 Email** and choose either **Create and Send a Message** (one step) or **Create a Draft Email** then **Send a Draft Message** (two steps).
3. Map **To**, **Subject**, and **Body** from the webhook output (`1.to`, `1.subject`, `1.body`) as in sections 2–3 above.
4. Add **Webhooks > Respond to webhook** with status 200 so the app gets a clear response.
