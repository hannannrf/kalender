# ADR-002: Deployment on free tiers and scheduled work through a per-minute tick and an outbox

**Status:** Accepted

## Context

Several requirements need work to happen at a time, not in response to a User request:

- **Reminders:** at least 98% must be sent no earlier than the Reminder Time and no more than 1 minute after it (NFR-03, FR-09).
- **Calendar retries:** up to 3 automatic retries within 15 minutes after a failed calendar add, change or remove (BR-10).
- **Time-based deletion:** dated Detected Events at the end of their date (BR-14), and "Needs date" items 7 days after the message (BR-05).
- **Confirming must never wait for Google Calendar** (MF-03 step 5), but the calendar copy must not be lost if the request ends.

Everything must be free (C-03). We checked current free tiers (November 2026):

- **Vercel Hobby** runs scheduled jobs at most once per day, with ±59 minutes of precision.
- **Free always-on hosts** no longer exist: Render, Koyeb and others put long-running Node processes to sleep when idle. Oracle Always Free may reclaim idle machines and needs a card.

So an always-on server with an in-process timer is not available for free.

**Drivers:** NFR-03, BR-05, BR-10, BR-14, C-03, NFR-02.

## Alternatives considered

| Alternative | For | Against |
|---|---|---|
| A. Always-on Node server with an in-process scheduler (node-cron) | Simplest code; second-level precision | No free host keeps it awake (C-03), and a sleeping server misses Reminders. |
| B. Vercel cron jobs | Built in | Hobby allows at most once per day with ±59 minutes, so it cannot meet NFR-03. |
| C. Keep a free Render instance awake by pinging it | Gives a long-running process | Works against the host's free-tier intent, can stop at any time, and the 750 hours/month barely cover one instance. |
| D. **Serverless API plus a free external per-minute tick plus a database job table and transactional outbox** | Free. Reminder Times fall on whole minutes, so a tick at each minute meets NFR-03. Work survives crashes because it is stored in the database. | Depends on an external timer service. Precision is about one minute, close to the NFR-03 limit. Needs an outbox and jobs design. |

## Decision

1. **Hosting:** the PWA and the Express API are deployed on Vercel (Hobby, free) as one project. The API runs as a serverless function. PostgreSQL runs on a free managed tier (Neon or Supabase; either fits ADR-005).
2. **Tick:** a free external scheduler (cron-job.org) calls `POST /internal/tick` **every minute**. The request is authenticated with a secret header (`TICK_SECRET`). One tick does three things, each bounded and safe to run twice:
   - delivers due Reminders (`reminders`);
   - runs due jobs from the `jobs` table: calendar retries, deletions under BR-05 and BR-14;
   - dispatches pending outbox messages.
3. **Transactional outbox:** when `events` confirms, edits or deletes an Event, it writes a domain event (`EventConfirmed`, `EventUpdated`, `EventDeleted`) to the `outbox` table **in the same database transaction**. After the request commits, the API tries to dispatch the outbox at once. Otherwise the next tick does it. Subscribers (`reminders`, `calendar-sync`) process each message idempotently, keyed by outbox id.
4. **Retries:** a failed calendar call creates a `jobs` row with `run_at` set by the BR-10 schedule (+1, +5 and +15 minutes). After the third failure the Event is marked "Calendar update failed" and a manual retry is offered.
5. **Request work stays short:** uploads are parsed and detected inside the request, since rule-based detection takes milliseconds (ADR-004). A Chat Export must fit the function's request size limit (4.5 MB, plenty for an export "Without media"); larger files are refused with a message to export Without media.

## Rationale

- Option D is the only free design that can meet NFR-03. Reminder Times are whole minutes (Event times and Lead Times are in minutes), so a tick at each minute delivers within the [Reminder Time, +1 min] window, provided the tick runs on time.
- Storing all future work in the database (jobs, outbox, reminders) means nothing is lost when a serverless function ends, which matches the "confirmation is not blocked" rule.
- The outbox removes direct calls from `events` to `reminders` and `calendar-sync`, which keeps the module boundaries from ADR-001.

## Trade-offs / consequences

- **External dependency:** if cron-job.org is late or down, Reminders are late. To limit the damage:
  - the tick also sends Reminders up to 10 minutes overdue, marked late;
  - every Reminder logs its scheduled and actual times so NFR-03 can be measured;
  - the PWA shows due Reminders inside the app whenever it is open (C-05).
- Each tick must finish well within the function time limit, so the work in one tick is batched (for example at most 200 Reminders and 50 jobs per tick).
- Tick handlers must be idempotent (status checks or unique keys), because a tick may run twice or overlap.
- A cold start of the serverless function and the free database adds a few seconds to the first tick after idle time, still inside the 1-minute window.
- **Google OAuth while the app is in "Testing" mode:** refresh tokens expire after 7 days, which shows up as "Calendar update failed" (MF-06 edge case). It is acceptable for the course demo and is documented for Users.
- If the team later gets a paid always-on host, only the tick trigger changes; the jobs, outbox and handlers stay the same.

## Revision: context v1.1 (after AI-agent validation)

1. **Inversion of control (Q-1):** `jobs` imports no feature module. Each module exports `register(jobs)`, which the composition root calls once. Inside it, the module registers its job handlers, outbox subscribers and tick tasks (for example `reminders` registers `deliverDue`).
2. **Per-subscriber idempotency (Q-10):**
   - the `outbox_deliveries` table records one row per message and subscriber;
   - `jobs` gets `cancel(tx, type, dedupeKey)`, a `dedupe_key` column and a nullable `user_id` on `jobs` and `outbox`, so retries can be cancelled on Event delete, unlink and account deletion (BR-10).
3. **Dispatch timing (Q-11):** the confirm, edit and delete routes call `jobs.dispatchOutbox` **before responding**, with a 2-second budget and a limit of 5 messages. The response is never changed by its errors, and the tick dispatches whatever is left. `waitUntil` is not used, to avoid a platform-specific dependency.
4. **Calendar backfill (Q-3):** `calendar-sync` publishes `CalendarLinked`; `events` answers with one `EventResync` per Upcoming Confirmed Event. This keeps `calendar-sync → events` out of the dependency graph.
5. **Late Reminders (Q-23):**
   - Reminders up to 10 minutes late are pushed and marked late;
   - Reminders later than that are shown in-app as "missed" and logged, but not pushed;
   - "presented" for NFR-03 means the in-app notification row was created.
6. **Housekeeping (Q-15):** a housekeeping job purges processed jobs, outbox and delivery rows after 7 days.

## Revision: context v1.2 (after the second AI-agent run)

- **Tick order (R2-1):** the outbox is dispatched **first**, then due jobs, then tick tasks such as `deliverDue`. A pending `EventDeleted` or `EventUpdated` therefore always reaches `reminders` before a stale Reminder could be sent (AC-09.2, AC-12.1).
- **Retry timing (R2-12):** retries at +1, +5 and +15 minutes are counted **from the first failure**, which keeps BR-10's "within 15 minutes".
- **NFR-03 evidence (R2-11):** scheduled and actual times are stored on the `reminders` rows, because platform logs on the free plan are short-lived.

