# ADR-005: Data ownership per module, one PostgreSQL database, and user isolation

**Status:** Accepted

## Context

The system stores Users, Approved Chats and read pointers, Detected Events with their temporary Source Message text, Confirmed Events, Reminders, Lead Time settings, push subscriptions, Google Calendar tokens and calendar copies, jobs and outbox messages. Several rules depend on reliable deletion and on who can see what:

- **Retention:** BR-05 and BR-14 delete message text and Detected Events on confirm, dismiss, at the end of the date, or after 7 days.
- **Revoke:** BR-06 deletes one Chat's unconfirmed data but keeps Confirmed Events.
- **Account deletion:** AC-13.3 removes everything for a User, including Google tokens.
- **Isolation:** BR-11 and AC-01.2 say a User can access only their own data, with one User role.

Free tiers allow one small managed PostgreSQL database (C-03).

**Drivers:** BR-05, BR-06, BR-11, BR-14, AC-01.2, AC-13.3, NFR-01, C-03.

## Alternatives considered

| Alternative | For | Against |
|---|---|---|
| A. One shared schema that every module reads and writes freely | Fast to start; easy joins | Deletion and retention rules get scattered. Any module could read message text, and an AI agent will create cross-module queries. |
| B. **One PostgreSQL database; each module owns its tables; other modules use its public interface; every user-owned row carries `user_id`** | One free database. Clear owners for retention and deletion, and isolation that can be enforced in one place. | Some data needs two interface calls instead of one join; owners must be respected by convention. |
| C. Database per module | Strongest isolation | Several free databases, distributed transactions between `chats` and `events`, and too much for the scope. |
| D. Row-Level Security policies in Postgres for isolation | Isolation enforced by the database | Needs per-request database roles or session variables with a serverless connection pool, which adds complexity. Kept as a possible later hardening. |

## Decision

1. **One PostgreSQL database** (free managed tier). Plain SQL migrations, accessed with `pg` (node-postgres); no ORM.
2. **Table ownership.** Only the owning module's repository reads or writes these tables.

| Module | Owns (tables) |
|---|---|
| `identity` | users, sessions |
| `chats` | approved_chats (Approval Time, Look-back, Start Point, Read-up-to Point, boundary fingerprints, last upload, revoked) |
| `events` | detected_events, source_messages (text only, BR-05), confirmed_events (incl. Manual) |
| `reminders` | reminders, reminder_settings, in_app_notifications, push_subscriptions |
| `calendar-sync` | calendar_links (encrypted Google tokens), calendar_copies |
| `jobs` | jobs, outbox, outbox_deliveries |

3. **User isolation:** every table above except `jobs` and `outbox` has a non-null `user_id`. Every repository function takes `userId` as a required first argument and filters by it. Route handlers get `userId` **only** from the authenticated session (`identity` middleware), never from the request body or URL. A request for another User's resource returns **404** (no existence leak), which AC-01.2 checks. Jobs and outbox payloads carry `userId`, and handlers pass it on.
4. **Authentication:** email and password accounts (`identity`). Passwords are hashed with bcrypt. Sessions are httpOnly, Secure, SameSite=Lax cookies with server-side session rows. Google sign-in is **not** used for app accounts. Google OAuth is used only by `calendar-sync` for the Calendar API, with the `calendar.events` scope.
5. **Secrets:** Google refresh and access tokens are encrypted at application level (AES-256-GCM, key in an environment variable). This is the one place application-level encryption is used.
6. **Deletion is owned:**
   - each module exposes `deleteAllForUser(userId)`, and `events` also exposes `deleteUnconfirmedForChat(userId, chatId, tx)`;
   - `identity.deleteAccount` calls them in a fixed order, cancels the User's jobs and deletes the sessions;
   - `chats.revoke` calls `events.deleteUnconfirmedForChat`.

## Rationale

- Option B gives each privacy and retention rule exactly one owner, which is what the demo and NFR-01 checks need, while staying within one free database.
- A single required `userId` parameter at the repository boundary is a simple, testable rule that an AI agent can follow and a reviewer can check by search.
- Owning tables per module mirrors ADR-001, so code and data boundaries match.

## Trade-offs / consequences

- No foreign keys or joins across module boundaries in application queries. Foreign keys inside a module are fine. Cross-module references (for example `confirmed_events.source_chat_id`) are plain ids plus a stored Chat name, so Confirmed Events can outlive a Revoked Chat (BR-06).
- Isolation depends on discipline at the repository layer. Tests must include a two-User access test for every resource type (AC-01.2). Row-Level Security remains a later option.
- Backups of the managed database are outside the deletion test scope, as the PRD already defers (AC-13.3).

## Revision: context v1.1 (after AI-agent validation)

- **System-scope repository functions (Q-8):** tick work (claiming due Reminders and jobs, expiry) is cross-User by nature. These repository functions are the only exception to "`userId` first". They must:
  - be named with the suffix `System` (for example `claimDueSystem`), so a reviewer can find them all by search;
  - be called only from registered tick tasks or job handlers;
  - pass each row on with its own `userId`.
- **No module imports `identity` (Q-2):** `requireUser()` is mounted once on `/api` by the composition root, and modules read `req.userId` through `shared`'s `AuthedRequest`.
- **Copies of Event data (Q-6):** `reminders` (title, date, time) and `calendar-sync` (snapshot for retries, Google event id) keep copies that are deleted on `EventDeleted` and `deleteAllForUser`. They are listed in architecture.md §8.
- **Retention of supporting data (Q-15):**

| Data | Kept until |
|---|---|
| Processed jobs, outbox and deliveries | 7 days |
| In-app notifications | 7 days |
| Sessions | 30 days |
| Past Confirmed Events | Deleted by the User or with the account |

- **Account deletion (Q-24):**
  - ordered, idempotent steps, each in its own transaction;
  - `deleteAllForUser` publishes no outbox messages, so Google copies stay (MF-06);
  - the Google token is revoked at Google best-effort before local deletion.
- **OAuth state (Q-27):** HMAC-signed with a secret from the environment, so there is no new table.
- **Authentication details (Q-26):** `bcryptjs` (pure JavaScript, avoids native builds on Vercel), hand-written input validation, passwords of at least 8 characters. Rate limiting and password reset are out of scope.
