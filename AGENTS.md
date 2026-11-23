# AGENTS.md: instructions for AI coding agents

You are working on **Kalender**, a phone-first PWA for a student, Mahd. He exports WhatsApp Chats and uploads them. The app detects meetings and deadlines in English and Roman Urdu, lets him confirm them, reminds him before each one, and copies them to his Google Calendar.

Read these before doing anything, in this order:
1. `docs/PRD.md`: the requirements (FR, NFR, BR, C, AC and glossary). **Its glossary terms are the names you use in code and UI.**
2. `docs/architecture.md`: modules, boundaries, interfaces, data ownership. **Sections 14 and 15** list design decisions already answered; do not ask them again.
3. `docs/adr/ADR-*.md`: decisions you must respect. Do not contradict an Accepted ADR.
4. `fixtures/README.md`: test data you must use unchanged.
5. `plan.md`: the current slice, its acceptance criteria and status. `docs/decisions.md`: decisions made during D4.

If any instruction here conflicts with those files, stop and ask (see the last section).

## 1. Product intent you must preserve

- Read **only** the Chats the User uploads, and only messages in the allowed window, **once** (BR-01, BR-02).
- **Never keep** message text or export files longer than the PRD allows, and **never log** them (BR-05, NFR-01).
- Never add an Event to the calendar or remind about it **without the User's confirmation**. Uncertain details must be reviewed first (FR-06, BR-21).
- Reminders must arrive on time (NFR-03). Calendar failures must never block confirmation (BR-10).

## 2. Agreed technologies (do not change)

- **Language:** TypeScript everywhere.
- **PWA:** React + Vite + `react-router-dom`, with a hand-written service worker (web push, Android share target). No Workbox or `vite-plugin-pwa`.
- **Server:** Node.js + Express, `multer` (memory storage only), `bcryptjs`, `fflate` (only to inflate `_chat.txt`), `web-push`.
- **Google:** Calendar REST API and OAuth 2.0 through built-in `fetch`. No `googleapis`.
- **Database:** PostgreSQL through `pg` (node-postgres) with plain SQL migration files.
- **Tests and tooling:** Vitest, `supertest`, ESLint + `typescript-eslint` (the boundary rules in section 4 are enforced with `no-restricted-imports`), GitHub Actions with a Postgres service container.
- **Deployment:** Vercel (PWA plus **one** function), a free Postgres (Neon or Supabase), and cron-job.org calling `/internal/tick` every minute.
- **Styling:** CSS Modules plus one `web/src/styles/tokens.css` holding every colour, radius, spacing and font token (see `docs/design/ui-direction.md`). Fonts: Bricolage Grotesque (headings) and DM Sans (body) from Google Fonts with `display=swap`. Icons: Tabler icons pasted as inline SVG components. No Tailwind, UI kit or icon package.
- **Deliberately not used:** an ORM, a date library, `googleapis`, `zod`, `node-cron`, `express-session`.

**Do not add** a new framework, ORM, database, queue, cache, auth provider, cloud service, LLM or NLP library without raising it for human approval (section 7).

## 3. Project structure conventions

- **Repository layout:**
  - one repository with npm workspaces and **two deployables**: `web/` (PWA) and `server/` (Express app);
  - the **only** file under `api/` is `api/index.ts`, the single Vercel function that re-exports the Express app from `server/`. Do not put other files in `api/`, because Vercel turns every file there into a function;
  - database migrations live in `server/migrations/`, one file per change, prefixed with the owning module name (for example `003_events_create_detected_events.sql`).
- **Server modules:** one folder per module, `server/src/modules/<module>/`, using these names: `identity`, `chats`, `ingestion`, `detection`, `events`, `reminders`, `calendar-sync`, `jobs`. Shared helpers go in `server/src/shared/`. Outbox message types live in `server/src/shared/contracts/`.
- **Composition root:** `server/src/app.ts` and `server/src/bootstrap.ts` are **not a module**. They are the only files that may import every module's `index.ts`, and only to:
  - mount `identity.requireUser()` once on `/api`;
  - mount each module's router and the tick route;
  - call each module's `register(jobs)` once.

  No business logic goes there.
- **Fixtures:** copy `fixtures/` into `server/test/fixtures/` **unchanged**; tests of any module may read them. Cross-module tests (NFR-01, AC-01.2) live in `server/test/`.
- **Public entry:** each module folder has an `index.ts` that is its **only public entry point**. Other modules import `modules/<name>` (the index), **never** a file inside another module.
- **Inside a module** use the layers that apply:
  - HTTP routes (only modules with endpoints);
  - service (use cases);
  - repository (SQL; the only place that touches the module's tables);
  - domain (pure logic);
  - tests next to the code.

  `ingestion` and `detection` have **only** pure domain code and tests: no routes, no repository.
- **HTTP:** routes are mounted under `/api`. `POST /internal/tick` is the only route outside `/api` and is protected by the `TICK_SECRET` header.

## 4. Boundary and dependency rules (must not be violated)

1. **Allowed module dependencies:**
   - `chats` → `ingestion`, `events`, `jobs`
   - `events` → `detection`, `jobs`
   - `reminders` → `jobs`
   - `calendar-sync` → `jobs`
   - `identity` → only `deleteAllForUser` of `chats`, `events`, `reminders` and `calendar-sync`, plus `jobs` (its own jobs, tick task and handler)
   - **`jobs` → nothing.** It only calls functions modules registered into it.
   - all modules → `shared`
   - exception: the HTTP read endpoints of `events` may call `calendar-sync.getStatuses` and `reminders.getReminderStates`

   Modules never import `identity`; they read `req.userId` through `shared`'s `AuthedRequest`. Any other import between modules is a violation.
2. **`events` must not call `reminders` or `calendar-sync`.**
   - Follow-up effects of confirming, editing or deleting an Event go **only** through `jobs.publish(tx, message)` **inside the same transaction** (transactional outbox, ADR-002).
   - The message types are fixed in architecture.md section 6.1: `EventConfirmed`, `EventUpdated`, `EventDeleted`, `CalendarLinked`, `EventResync`.
   - Subscribers must be idempotent; `jobs` records one delivery per subscriber.
3. **Table ownership:** a module reads and writes **only its own tables** (architecture.md section 5.2, ADR-005). No SQL joins across module tables; ask the owning module through its interface.
4. **`ingestion` and `detection` are pure:** no database, network, filesystem, environment variables, `Date.now()` or logging. Time is passed in as a parameter.
5. **Only `ingestion` knows the WhatsApp export format.** Never parse export text anywhere else, including the PWA.
6. **Only `calendar-sync` talks to Google. Only `reminders` sends web push.**
7. **Scheduled work** is a job handler or tick task registered with `jobs` (through the module's `register(jobs)`) and run by the tick. Do not add `setInterval`, `node-cron` or Vercel cron (ADR-002). Handlers must be idempotent, batched and use `FOR UPDATE SKIP LOCKED` when claiming rows.

## 5. Data and privacy rules

- **Repositories:**
  - every function takes `userId` as its first argument and filters by it;
  - **only exception:** functions that tick work needs across Users. They must be named with the suffix `System` (for example `claimDueSystem`), be called only from registered tick tasks or job handlers, and hand each row on with its own `userId`.
  - route handlers get `userId` only from `req.userId`, never from the body, query or URL;
  - if a resource belongs to another User, return 404.
- **Message text:**
  - may be stored only in `events.source_messages` (with sender and sent time) and must be deleted by the BR-05 and BR-14 rules, once **no** Detected Event uses it;
  - a message that produces no Detected Event is never stored;
  - **titles and places are never the message text:** title is at most 60 characters built from activity words, and place is at most 40 characters from an explicit location phrase (architecture.md section 8).
- **Upload files:**
  - handle uploads in memory only (multer memory storage or equivalent). Never write them to disk, `/tmp`, blob storage or logs;
  - never open media entries inside a `.zip`.
- **Logging and errors:**
  - **never log, print or return message text, Chat names in error stacks, file contents or tokens.** Logs contain ids, counts and timings only;
  - use the redacting logger in `shared`.
- **Tokens:** Google tokens are stored only encrypted (AES-256-GCM, key from environment).
- **Times:** store instants as UTC `timestamptz`. Event dates are `date` plus an optional `time` in PKT (UTC+5, no daylight saving). All-day means no time.
- **Upload state:** save a Chat's read pointers only in the same transaction that stores the detection results (BR-02).

## 6. Testing rules

- **Acceptance criteria:** every FR's acceptance criteria (PRD `AC-xx.y`) get at least one automated test named with the AC id.
- **Detection gate:** `detection` must be tested against `detection_test_set.csv` with the NFR-05 thresholds (M1–M4). This test is a CI gate. **Never edit the test set or thresholds to make it pass**; fix the rules.
- **Exports:** `ingestion` and `chats` tests use the sample exports and the demo cases N1, N2, B1, B2, F1, F2 and F3 mapped in `fixtures/README.md`, plus the real exports in `fixtures/exports/real/` once the team adds them.
- **Isolation:** every resource type has a two-User access test (AC-01.2).
- **Manual checks:** ACs that need a real phone or a real Google account (push, Google Calendar copies) and pure UI ACs are verified by a manual checklist row with a screenshot in the slice evidence file (R2-16, gap G-10).

## 7. Actions that need human approval first

Stop and ask before you:
- add or replace a framework, library, service, database, ORM, queue or deployment target;
- add a module, merge modules, or change the allowed dependencies or table ownership;
- change a public module interface used by another module;
- change any business rule, threshold, retention period, Lead Time choice or time rule, or anything in `PRD.md` or an ADR;
- store any new kind of personal data or message content, or log anything that might contain it;
- add an LLM, AI or external NLP call of any kind;
- delete or rewrite migrations that have already been applied;
- connect to WhatsApp in any way other than parsing an uploaded export.

## 8. Ambiguity and conflicts

- If the PRD, architecture.md, an ADR and this file disagree, **do not pick one silently.** State the conflict, quote both sources, propose options, and wait.
- If a requirement is unclear, ask a question that names the requirement id (for example "BR-21 U1: does '12 baje' with 'raat' count as U2?"). Do not invent behaviour.
- Do not implement features the PRD lists as Non-goals or Open Questions (for example Snooze, OQ-04).
- When you finish a task, list which FR, BR and AC ids it covers and any assumption you made.

## 9. Git and evidence workflow

- `main` is always deployable. Vercel deploys `main` to production and every PR to a preview.
- One branch per slice: `slice/Sxx-short-name`. Commit messages start with the slice id (`S03: add day-word rules`). Merge with a PR whose description lists the ACs covered and the check results.
- After the human accepts a slice, tag the merge commit `Sxx-accepted`.
- Every slice has `evidence/slices/Sxx-*.md` (criteria, HITL or AFK, prompt, checks, human decision) and one row in `evidence/workflow-evidence-log.md`.
- When `plan.md` changes in a meaningful way, copy it to `docs/plan-history/plan-vNN.md` in the same commit.
- Never commit `.env*` files except `.env.example`, secrets, real names from exports, or message text outside `fixtures/`.
