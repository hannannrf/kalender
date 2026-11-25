# plan.md: Kalender (Deliverable 4)

| Field | Value |
|---|---|
| Plan version | v11 (25 Nov 2026) |
| Changes from v10 | S10 Accepted (web push through a hand-written service worker, installable PWA; checked on a real Android phone). Risk for S13: a large job backlog makes the tick slow from Vercel to Neon `dev`, and jobs run before Reminders. The Android share target is left out (S10 decision 8) |
| Changes from v09 | S09 Accepted (delete the account and everything it owns; AFK build after one Gate 1 product question: the User types their password again). S11 must add `calendar-sync.deleteAllForUser` to account deletion and closes the Google token part of AC-13.3 |
| Changes from v08 | S08 Accepted (Possible Duplicate with add, update or dismiss). It ran as HITL, not AFK, because Gate 1 needed a BR-13 reading (D-28: a missing place keeps the existing place). The calendar part of AC-06.4 stays with S11 |
| Changes from v07 | S05 Accepted (Chat update, iPhone `.zip`, date-order question, Revoke; HITL, not AFK); O-3 iPhone half done with a scrubbed real export, Android half still open |
| Changes from v06 | S07 Accepted (jobs, outbox, tick, in-app Reminders, Lead Time, timed deletions); O-5 still open, now needed before Gate 5 |
| Changes from v05 | S06 Accepted (Manual Events, edit and delete a Confirmed Event); run before S05, which waits for O-3 |
| Changes from v04 | S04 Accepted (review, confirm, dismiss, upcoming Events list) |
| Changes from v03 | S03 Accepted (NFR-05 gate passes 80 of 80; CI re-scores it with `evaluate.py`) |
| Changes from v02 | S02 Accepted; O-3 now needed before `ingestion` is accepted in S05 (S02 reads Android `.txt` only), one real iPhone export received |
| Changes from v01 | AC-02.5 moved from S01 to S02 (the Approved Chats list arrives in S02); S01 Accepted; O-1 and O-2 done |
| History | `docs/plan-history/plan-vNN.md` plus `git log -- plan.md` |
| Context | `docs/PRD.md` v1.2, `docs/architecture.md` v1.3, `AGENTS.md`, `docs/adr/`, `docs/decisions.md` |
| Deadline | Friday 27 Nov 2026 |
| Plan owner | Abdul Hannan Rauf |

## Objective

Ship Kalender: a phone-first PWA where a student uploads WhatsApp Chat Exports, reviews the Events Kalender detects in English and Roman Urdu, confirms them, gets one Reminder before each, and optionally copies them to Google Calendar. Every slice is built with the AI-native loop and leaves evidence.

## Assumptions

- A1. The approved D3 context (PRD, architecture, ADRs, AGENTS.md, fixtures) is the baseline. Changes go through `docs/decisions.md`.
- A2. Free tiers only: Vercel Hobby, Neon free, cron-job.org, Google Cloud OAuth client in Testing mode.
- A3. Detection is rule-based (ADR-004, D-23). No LLM call in the product.
- A4. Times are PKT only (UTC+5).

## Open issues

| ID | Issue | Owner | Needed by |
|---|---|---|---|
| O-1 | Neon project and `DATABASE_URL` for `dev` and `main` branches (G-09) | Abdul Hannan Rauf | Done 23 Nov (Neon branches `dev` and `production`) |
| O-2 | Vercel project linked to the GitHub repo, env vars set | Abdul Hannan Rauf | Done 23 Nov |
| O-3 | One real Android and one real iPhone export, names replaced (G-06). iPhone: done 24 Nov (`fixtures/exports/real/`, names, links and roll numbers replaced). Android: still missing | Zain Amjad | Android before Gate 5 (S13); S05 accepted with the iPhone export only |
| O-4 | Google Cloud OAuth client (Testing mode) | Zain Amjad | Before S11 |
| O-5 | cron-job.org job calling `/internal/tick` every minute | Abdul Hannan Rauf | Before Gate 5 (S13); S07 accepted without it on 24 Nov |
| O-6 | NFR-04 session with Mahd and two classmates on 26 Nov (G-07) | Muhammad Areeb | S13 |
| O-7 | Slice owners below are a proposal; the team confirms them | Team | Before S01 |

## How each slice runs

Nine steps per slice: select, load context, refine criteria and tests, choose HITL or AFK, AI implements, run checks, human Accept / Revise / Reject, integrate, update context. Evidence goes to `evidence/slices/Sxx-*.md` and one row in `evidence/workflow-evidence-log.md`.

**HITL or AFK:** HITL when the slice has privacy risk, ambiguous rules or an external system. AFK when the rules are exact and fixtures exist. AFK output is still reviewed by a human before Accept.

**Quality gates per slice:** G1 readiness (scope, FR/BR links, AC ids, EP/BVA cases written before coding); G2 functional (tests for the ACs pass); G3 architecture and constraints (`npm run lint` boundary rules, privacy checklist, no extra features); G4 regression (full suite green on `main` after merge); G5 final product check (S13, end-to-end script).

## Slice backlog

Priority: M = Must, S = Should, C = Could. Status: Planned, In progress, Accepted, Revised, Rejected, Cut.

| ID | Slice (what the User can do) | FR / BR / NFR | ACs | Depends | Mode | Pri | Day | Lead (proposed) | Status | Gates |
|---|---|---|---|---|---|---|---|---|---|---|
| S00 | Walking skeleton: app shell with Kalender tokens loads; `/api/health` answers; test, lint and CI run; deploys to Vercel | infra | – | – | AFK | M | Tue 24 | Abdul Hannan Rauf | Accepted | G1 G2 G3 pass |
| S01 | Create account, sign in and out, see only own data | FR-01, BR-11 | 01.1, 01.2 | S00 | HITL | M | Tue 24 | Muhammad Areeb | Accepted | G1 G2 G3 pass |
| S02 | Approve a Chat from an Android `.txt` export: preview name, choose Look-back, see messages read; bad files refused | FR-02, BR-01..03, BR-05, BR-15, NFR-01 | 02.1, 02.3, 02.5 | S01 | HITL | M | Tue 24 | Zain Amjad | Accepted | G1 G2 G3 pass |
| S03 | Detected Events appear after upload (English and Roman Urdu rules, Uncertain marks, Needs date) plus the NFR-05 gate | FR-05, BR-12, BR-17, BR-20, BR-21, NFR-05 | 05.1..05.9, 05.12, 05.13 | S02 | HITL | M | Tue 24 | Abdul Hannan Rauf | Accepted | G1 G2 G3 pass |
| S04 | Review a Detected Event: resolve Uncertain details, edit, confirm, dismiss; upcoming Events list | FR-06, FR-11, BR-05, BR-16 | 06.1..06.3, 06.5, 06.7, 06.8, 11.1, 11.2 | S03 | HITL | M | Wed 25 | Muhammad Areeb | Accepted | G1 G2 G3 pass |
| S05 | Update an Approved Chat, iPhone `.zip`, date-order question, Approved Chats list, Revoke | FR-03, FR-04, BR-02, BR-06, BR-15 | 02.2, 02.4, 03.1..03.3, 04.1, 04.2 | S02, S03 | HITL | M | Wed 25 | Zain Amjad | Accepted | G1 G2 G3 pass |
| S06 | Manual Event; edit and delete a Confirmed Event | FR-07, FR-12, BR-16 | 07.1, 07.2, 12.1*, 12.2* | S04 | AFK | M | Wed 25 | Muhammad Areeb | Accepted | G1 G2 G3 pass |
| S07 | Jobs, tick, in-app Reminders, Lead Time settings, timed deletions | FR-09 (in-app), FR-10, BR-05, BR-07, BR-08, BR-14, BR-19, NFR-03 | 09.1..09.5, 10.1..10.4, 05.11, 06.6 | S04, S06 | HITL | M | Thu 26 | Abdul Hannan Rauf | Accepted | G1 G2 G3 pass |
| S08 | Possible Duplicate: add new, update existing, or dismiss | BR-04, BR-13 | 05.10, 06.4* | S04 | HITL | M | Thu 26 | Zain Amjad | Accepted | G1 G2 G3 pass |
| S09 | Delete account and everything it owns | FR-13, MF-07 | 13.1, 13.3* | S07 | AFK | M | Thu 26 | Muhammad Areeb | Accepted | G1 G2 G3 pass |
| S10 | Push notifications through the service worker; installable PWA | FR-09 (push), C-05 | 09.3 | S07 | HITL | S | Thu 26 | Muhammad Areeb | Accepted | G1 G2 G3 pass |
| S11 | Connect Google Calendar: one-way copies, retries, "Calendar update failed", unlink | FR-08, FR-13 (unlink), BR-09, BR-10, BR-18 | 08.1..08.3, 12.1, 12.2, 13.2, 13.3, 06.4 | S07 | HITL | S | Thu 26 | Zain Amjad | Planned | – |
| S12 | Upload nudge for stale Approved Chats (OQ-05, D-27) | new FR-14 | new AC-14.x | S07 | AFK | C | Thu 26 | Muhammad Areeb | Planned | – |
| S13 | Polish, Gate 5 end-to-end run, NFR-02/03/04 evidence | NFR-02..04 | all | all | HITL | M | Thu 26 | Abdul Hannan Rauf | Planned | – |

`*` The calendar part of that AC is closed in S11.

**Cut line if late:** S12 first, then S10 (in-app Reminders still meet C-05), then S11 last. Each cut needs a PRD note and Mahd's agreement.

## Schedule

| Day | Work |
|---|---|
| Mon 23 Nov | Phase 1 planning and approval; Stage 2 gap review; repo, plan v01, S00 |
| Tue 24 Nov | S00 deployed, S01, S02, S03 with the NFR-05 gate |
| Wed 25 Nov | S04, S05, S06 |
| Thu 26 Nov | S07, S08, S09, S10, S11, S12 if time, S13 and Gate 5 |
| Fri 27 Nov | Final report with CCP analysis, contribution log, rehearsal, submit early |
