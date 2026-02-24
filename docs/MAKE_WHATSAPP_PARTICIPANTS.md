# Make.com → WhatsApp Participants (Supabase)

Reference for the **Pull participants** scenario: read selected groups from Supabase, fetch participants from WhatsApp/Green API, and upsert into `whatsapp_group_participants`.

---

## Overview

- **Trigger:** Webhook (manual or from app “Sync participants” button).
- **Flow:** Supabase → get `whatsapp_dashboard_groups` → for each group call WhatsApp/Green API to get participants → upsert into `whatsapp_group_participants`.
- **App env:** `MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL` — set this to your Make.com webhook URL.

**Seeding dashboard groups:** The list of “selected” groups lives in `whatsapp_dashboard_groups`. To seed it (e.g. the 35 groups for the participants page), run the SQL script **`scripts/seed-whatsapp-dashboard-groups.sql`** once in the Supabase SQL Editor. The CSV import and Make.com both read from this table (no hardcoded list in the app).

---

## Webhook

- **Method:** POST
- **Body (optional):** `{ "trigger": "pull_participants" }` or `{}`
- **Response (success):** 200 with body e.g. `{ "success": true, "groupsProcessed": N }`
- **Response (error):** 4xx/5xx with error message in body so the app can show it.

---

## Supabase tables

### Read: `whatsapp_dashboard_groups`

| Column      | Type    | Use in Make.com |
|------------|---------|------------------|
| `group_id` | text PK | WhatsApp group id (e.g. `120363024669282426@g.us`) — use this to call the API per group |
| `group_name` | text  | Denormalized name; use when upserting participants |
| `added_at` | timestamptz | Optional |

Query all rows to get the list of groups to process. No filter needed; only selected groups are in this table.

### Upsert: `whatsapp_group_participants`

| Column             | Type    | Set from Make.com |
|-------------------|---------|-------------------|
| `id`              | uuid    | Leave to default (gen_random_uuid()) on insert |
| `group_chat_id`   | text    | Same as `group_id` from dashboard groups |
| `group_chat_name` | text    | Same as `group_name` from dashboard groups |
| `participant_id`  | text    | e.g. `61493324958@c.us` from API |
| `participant_phone` | text  | Raw number (for copy-paste); extract from participant_id if API only returns id |
| `participant_name`| text    | Display name or null |
| `created_at`      | timestamptz | Default `now()` |

**Upsert key:** `(group_chat_id, participant_id)`. Use Supabase “Upsert” with conflict on these columns so re-runs update existing rows and add new ones.

---

## Scenario flow (high level)

1. **Webhook** — Receive POST (manual trigger or from app).
2. **Supabase – Get rows** — List all rows from `whatsapp_dashboard_groups` (fields: `group_id`, `group_name`).
3. **Iterator** — For each group:
   - Call WhatsApp/Green API to get participants for `group_id`.
   - Map each participant to: `group_chat_id`, `group_chat_name`, `participant_id`, `participant_phone`, `participant_name`.
4. **Supabase – Upsert** — For each group’s participant list, upsert into `whatsapp_group_participants` with conflict on `(group_chat_id, participant_id)`.
5. **Respond to webhook** — Return 200 with `{ "success": true, "groupsProcessed": N }`.

Use error/Resume handlers on Supabase and HTTP modules so failures return a clear message to the app.

---

## CSV import (column mapping)

For the one-time CSV import (POST `/api/whatsapp/import-participants-csv`), the CSV columns map as follows:

| CSV column        | DB column          | Notes |
|-------------------|--------------------|--------|
| Group Chat        | `group_chat_name`  | May contain commas; first column |
| Participant ID    | `participant_id`   | e.g. `61493324958@c.us` |
| Name              | `participant_name` | Optional |
| Partipant Number  | `participant_phone`| Typo in header; raw number |
| Group Chat ID     | `group_chat_id`    | e.g. `120363024669282426@g.us` |

Only rows whose **Group Chat ID** is in the selected dashboard groups list are imported into `whatsapp_group_participants`. The same import seeds `whatsapp_dashboard_groups` with the 35 selected groups.

---

## Env (app)

| Variable | Purpose |
|----------|---------|
| `MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL` | Make.com webhook URL for this scenario; used by “Sync participants” button |
| `WHATSAPP_IMPORT_SECRET` | Optional; required as header `X-Import-Secret` when calling the CSV import API |
