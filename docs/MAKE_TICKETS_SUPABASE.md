# Make.com → Support Tickets (Supabase)

Reference for what to send from a Make.com scenario into the `support_tickets` table.

---

## Option A: Use the app’s API (recommended)

Call the app’s create-ticket endpoint so validation and defaults are handled.

- **URL:** `POST https://<your-app-domain>/api/create-ticket`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**

| Field           | Type   | Required | Description |
|----------------|--------|----------|-------------|
| `caller_name`  | string | ✅ Yes   | Caller’s name |
| `caller_phone` | string | ✅ Yes   | Caller’s phone number |
| `caller_business` | string | No    | Business name (optional) |
| `inquiry`      | string | ✅ Yes   | What the caller asked / issue description |
| `summary`      | string | No       | Short summary (e.g. from VAPI analysis) |
| `vapi_call_id` | string | No       | VAPI call ID to link ticket to call |
| `recording_url`| string | No       | URL of the call recording |

**Example body from Make.com (e.g. after a VAPI call):**

```json
{
  "caller_name": "{{caller_name_from_trigger}}",
  "caller_phone": "{{caller_phone_from_trigger}}",
  "caller_business": "{{caller_business_or_empty}}",
  "inquiry": "{{inquiry_or_transcript_summary}}",
  "summary": "{{vapi_analysis_summary}}",
  "vapi_call_id": "{{vapi_call_id}}",
  "recording_url": "{{vapi_recording_url}}"
}
```

The API will set `status` to `open` and leave `assigned_to`, `notes`, `id`, `created_at`, `updated_at`, `resolved_at` to DB defaults or app logic.

---

## Option B: Insert directly into Supabase

If you use Make.com’s Supabase module to insert into `support_tickets`, map your scenario data like this.

### Columns you should set from Make.com

| Supabase column   | Type      | Required | From Make.com / Notes |
|-------------------|-----------|----------|------------------------|
| `caller_name`     | text      | ✅ Yes   | Caller name |
| `caller_phone`    | text      | ✅ Yes   | Caller phone |
| `caller_business` | text      | No       | Business name or `null` |
| `inquiry`         | text      | ✅ Yes   | Inquiry / issue text |
| `summary`         | text      | No       | Summary or `null` |
| `status`          | text      | No       | Use `'open'` for new tickets. Must be one of: `open`, `in-progress`, `resolved` |
| `assigned_to`     | text      | No       | Assignee name/id or `null` |
| `vapi_call_id`    | text      | No       | VAPI call ID or `null` |
| `recording_url`   | text      | No       | Recording URL or `null` |
| `notes`           | text      | No       | Internal notes or `null` |

### Columns to leave to the database (don’t set in Make.com)

| Column       | Why |
|-------------|-----|
| `id`        | Default `gen_random_uuid()` |
| `created_at`| Default `now()` |
| `updated_at`| Default `now()` |
| `resolved_at` | Set by app when status → `resolved`; leave `null` for new tickets |

### Example row (conceptually) for a new ticket

- `caller_name`: `"Jane Smith"`
- `caller_phone`: `"+61412345678"`
- `caller_business`: `"Acme Pty Ltd"` or `null`
- `inquiry`: `"Need help resetting password and access to portal"`
- `summary`: `"Customer requested password reset and portal access"` or `null`
- `status`: `"open"`
- `assigned_to`: `null`
- `vapi_call_id`: `"abc123-vapi-call-id"` or `null`
- `recording_url`: `"https://..."` or `null`
- `notes`: `null`
- Do **not** set: `id`, `created_at`, `updated_at`, `resolved_at` (let DB/app handle them).

---

## Status values

Allowed values for `status` (enforced by the table check constraint):

- `open`
- `in-progress`
- `resolved`

New tickets from Make.com should use `open` unless you have a specific reason otherwise.

---

## Suggested Make.com flow (VAPI → ticket)

1. **Trigger:** VAPI webhook (call ended) or similar.
2. **Map:** From the webhook payload, map:
   - Caller name/number (or “Unknown” if missing).
   - Inquiry: e.g. transcript summary or first message.
   - Summary: e.g. from VAPI analysis if available.
   - `vapi_call_id`, `recording_url` from VAPI payload.
3. **Action:** Either:
   - **HTTP module:** `POST` to `https://<your-app>/api/create-ticket` with the JSON body above, or  
   - **Supabase “Create a record”:** Insert into `support_tickets` with only the columns listed in Option B and leave `id`/timestamps to the DB.

Using Option A (API) is recommended so validation and defaults stay in one place.
