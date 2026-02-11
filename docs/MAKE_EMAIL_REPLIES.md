# Make.com: Email replies and threading

How to wire Make.com so that:

1. **Outbound:** The app sends a reply via a Make.com webhook → Make.com sends the email (e.g. Outlook).
2. **Inbound:** When a customer replies to that email, Make.com recognises the thread and adds the reply to the ticket in the app.

---

## Outbound: Send reply from app

When a team member clicks **Send reply** in the ticket detail, the app:

1. Saves the reply in the `ticket_replies` table (direction: `outbound`).
2. Calls your **Send email** webhook with the payload below.

### Webhook URL

Set in the app as `MAKE_SEND_EMAIL_WEBHOOK_URL` (e.g. your Make.com webhook URL for “Send ticket reply”).

### Payload the app sends (POST, JSON)

| Field         | Type   | Description |
|---------------|--------|-------------|
| `ticket_id`   | string | Ticket UUID |
| `reply_id`    | string | `ticket_replies.id` (for reference) |
| `to`          | string | Customer email (e.g. `ticket.caller_email`) |
| `subject`     | string | `Re: …` (original subject, normalised) |
| `body`        | string | Reply body (HTML or plain text) |
| `body_plain`  | string | Optional plain-text version |
| `cc`          | string | Optional CC addresses |
| `message_id`  | string | Message-ID to set on the sent email (for threading) |
| `in_reply_to` | string | Message-ID this reply is in response to |
| `references`   | string | Space-separated Message-IDs for the thread |

### Make.com scenario (outbound)

1. **Webhook** – trigger: receive the JSON above.
2. **Send email** – e.g. Microsoft Graph “Send mail” or Gmail “Send email”:
   - To: `{{to}}`
   - Subject: `{{subject}}`
   - Body: `{{body}}` (or use `body_plain` if your module expects plain text)
   - **Headers** (if your email module supports custom headers; required for threading):
     - `In-Reply-To`: `{{in_reply_to}}`
     - `References`: `{{references}}`
     - `Message-ID`: `{{message_id}}`

If you cannot set `Message-ID` in Make.com, the app still stores one; the customer’s client may generate a different one. Threading can still work via `In-Reply-To` and `References`.

---

## Inbound: Customer replies (add to thread)

When a **new email** arrives in Outlook (or your inbox):

1. **Check if it’s a reply**  
   Use the email’s `In-Reply-To` or `References` header. If it matches:
   - A ticket’s `email_message_id`, or  
   - Any `ticket_replies.message_id` for a reply in your DB  
   then it belongs to an existing ticket.

2. **If it’s a reply to an existing ticket**
   - Call the app to add the reply to the thread (see below).
   - Optionally update the ticket’s `updated_at` (the API does this when you add a reply).

3. **If it’s not a reply**  
   Treat it as a new ticket (your existing flow: create ticket via `POST /api/create-ticket` or Supabase).

### API: Add inbound reply to ticket

- **URL:** `POST https://<your-app-domain>/api/add-ticket-reply`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

| Field              | Type   | Required | Description |
|--------------------|--------|----------|-------------|
| `ticket_id`        | string | ✅ Yes   | Ticket UUID (the one you matched from In-Reply-To/References) |
| `body`             | string | ✅ Yes   | Email body (HTML or plain) |
| `body_plain`       | string | No       | Plain-text body |
| `from_email`       | string | No       | Sender address |
| `to_email`         | string | No       | To address |
| `cc`               | string | No       | CC header |
| `subject`          | string | No       | Subject |
| `message_id`       | string | No       | Email Message-ID (for future threading) |
| `in_reply_to`      | string | No       | In-Reply-To header |
| `references_header`| string | No       | References header |

Example:

```json
{
  "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
  "body": "<p>Thanks, I've attached the document.</p>",
  "body_plain": "Thanks, I've attached the document.",
  "from_email": "customer@example.com",
  "subject": "Re: Support request #123",
  "message_id": "<abc@mail.example.com>"
}
```

The app inserts a row into `ticket_replies` with `direction: 'inbound'` and updates the ticket’s `updated_at`.

### Make.com scenario (inbound)

1. **Trigger:** e.g. “Watch Outlook emails” or “Email moved to folder”.
2. **Router or filter:**  
   - If `In-Reply-To` or `References` matches a known ticket/reply → route to “Add reply”.  
   - Else → route to “Create new ticket”.
3. **Add reply branch:**  
   - Look up ticket (e.g. Supabase: `support_tickets` + `ticket_replies` by `message_id` / `email_message_id`; or use a module that parses References).  
   - HTTP POST to `https://<your-app>/api/add-ticket-reply` with the body above.
4. **Create new ticket branch:**  
   - Your existing flow (e.g. `POST /api/create-ticket`).

---

## Threading summary

| Direction  | Where it happens | What to do |
|-----------|-------------------|------------|
| **Outbound** | User clicks “Send reply” in app | App calls your webhook → you send email with `In-Reply-To` / `References` / `Message-ID`. |
| **Inbound**  | Customer replies in email       | Make.com matches thread by `In-Reply-To`/`References`, then calls `POST /api/add-ticket-reply`. |

Keeping `message_id`, `in_reply_to`, and `references` in sync (in the app and in sent/received emails) gives you a single thread per ticket in both the app and the email client.
