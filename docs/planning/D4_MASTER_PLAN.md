# Deliverable 4 Master Plan: WhatsApp & Calendar Sync

Team: Abdul Hannan Rauf (25I-3053), Zain Amjad (25I-3042), Muhammad Areeb (25I-3056). Client: Mahd Ahmed.
Deadline: **Friday 27 November 2026**. Today: Sunday 22 November 2026, so we have **5 working days**.
Status of this file: working plan for the team. It is not `plan.md`. The real `plan.md` is produced in Stage 2 (step 2.4) and versioned from `plan-v01.md`.

---

## 0. What D4 grades, in one table

| Criterion | Points | What earns it |
|---|---|---|
| Validate, Plan & plan.md evolution | 15 | AI review of the context, gaps resolved, vertical slices, **every plan version kept** |
| AI-native slice-by-slice workflow | 20 | Repeated loops: context, implement, test, review, Accept/Revise/Reject, integrate. HITL/AFK chosen per slice |
| Working product & requirements | 25 | The promised FRs work in the demo |
| Integration, validation & demo | 15 | Main flows and edge cases work end to end; checks shown; chosen deployment works |
| CCP analysis & engineering judgment | 15 | Complexity, 2+ alternatives, trade-off, integration, metric, scalability, ethics |
| Evidence, demo & group participation | 10 | Evidence rebuilds the history; every member can defend everything |

**Rule that drives the whole plan:** anything we promise must work in the demo, and anything we did without evidence earns nothing. So we cut risky promises early, and we write evidence while we work, never at the end.

---

## 1. Ponytail pushback: what the D3 architecture promised that we should not carry into the demo

D3 committed to Vercel + Neon + cron-job.org + GitHub Actions + Web Push + Android share target + Google Calendar. D4 says local execution is fully acceptable and that a sophisticated platform earns no extra marks. Every external service is a demo failure risk.

| D3 commitment | Recommendation | Why | Artefact change |
|---|---|---|---|
| Vercel serverless hosting | **Drop. Run locally** (`npm run dev` / `npm start`). | No marks for cloud; one more thing that can break. | New ADR-006 "Local deployment for the course demo", supersedes ADR-002 decision 1 only. |
| cron-job.org calls `/internal/tick` | **Replace** with a tiny local ticker script that POSTs `/internal/tick` every minute. Same endpoint, same secret, same jobs code. | cron-job.org cannot reach `localhost`. The jobs/outbox design stays exactly as ADR-002 says. | ADR-006 (tick trigger). ADR-002 already says "only the tick trigger changes". |
| Neon/Supabase Postgres | **Local PostgreSQL** (decision D-A below). | No Postgres or Docker is installed on this laptop yet. | ADR-006. |
| GitHub Actions CI | **Optional.** Local `npm test` + `npm run lint` + detection gate is the quality gate. Push to GitHub only if the team wants. | Git history is enough for plan evidence. | AGENTS.md §2 and §6 wording. |
| Web Push on a phone | **Keep, demo on desktop Chrome** (push works on `localhost`). In-app Reminder is the guaranteed path (C-05). Phone push only if we run a free HTTPS tunnel. | Phone push needs HTTPS. | Note in README and limitations. |
| Android share target | **Cut to "Could".** File picker upload covers C-04. | Needs HTTPS + installed PWA on a phone. | plan.md scope note. |
| Google Calendar (FR-08) | **Keep, but as a late slice with a fallback.** It is a core FR the client wanted. | Needs a Google Cloud OAuth client (free, Testing mode). | None if delivered. If cut: PRD change + client confirmation. |
| NFR-03 "50 Reminders over one week" | **Compress** to 50 Reminders over about one hour, logged. | We do not have a week. | Deviation recorded in the test evidence and the report. |
| AGENTS.md "every AC gets an automated test" | **Keep for server ACs** (cheap with supertest). Push/Google/UI-highlight ACs get a manual checklist row. | Testing guide says lightweight; AGENTS.md already allows this for UI ACs (R2-16). | AGENTS.md §6 one line. |

Not asked for and not added: microservices, ORM, LLM detection, recurring Events, Snooze (OQ-04), calendar view.

---

## 2. Decisions the team must make before Slice 1

| ID | Decision | Recommended | Alternatives |
|---|---|---|---|
| D-A | Database | **Install PostgreSQL 17 locally** (Windows installer). Matches ADR-005 and `pg` exactly. | Neon free tier (needs internet in the demo); PGlite in-process (new dependency + ADR change). |
| D-B | Deployment | **Local** (laptop, browser at `localhost`), optional HTTPS tunnel for a phone demo. | Keep Vercel + Neon + cron-job.org as in D3. |
| D-C | Google Calendar | **Keep FR-08**; someone creates a Google Cloud OAuth client today (Testing mode, own Gmail as test user). | Drop FR-08 and ask Mahd (PRD change, marks risk). |
| D-D | Extra feature (instruction 2: "improve the product") | **OQ-05 upload nudge**: a daily in-app/push nudge "SE-3D Class not updated for 2 days, export it again". Directly fixes the biggest product gap (NG-12: Events in un-uploaded messages are missed). Small: one `reminders` tick task. | Snooze (OQ-04, changes NG-07); `.ics` download of an Event (needs PRD FR). |
| D-E | Slice owners | See section 5. | Any split, as long as each member leads 3+ slices. |
| D-F | Repository | New folder `D:\ISE PROJECT\ISE1003 WhatsApp Calendar Sync (Del 4)\app`, **local git from the first commit**. GitHub optional. | GitHub repo from the start. |

Each accepted decision goes into `docs/decisions.md` (or an ADR) and the plan version that follows it.

---

## 3. Stage 2: Validate & Plan (Day 1, 22 to 23 Nov)

1. **Create the repo** and copy the approved context into it: `docs/PRD.md` (v1.1), `docs/architecture.md`, `AGENTS.md` (repo root), `docs/adr/ADR-001..005`, `fixtures/` (unchanged), `architecture-diagram.png`. First commit: "D3 context baseline".
2. **AI gap review (evidence item).** Prompt the agent to review PRD, architecture, AGENTS.md and ADRs against the D4 brief and the 5-day timeline. Save the prompt and full answer in `evidence/stage2/gap-review.md`. Gaps already found while preparing this plan:
   - G-01 Deployment (Vercel, cron-job.org) vs local demo. Resolve with ADR-006.
   - G-02 No database on this machine. Resolve with D-A.
   - G-03 **Sample exports are dated October 2026.** With a 7-day Look-back in a late-November demo, a real upload of them reads nothing. Tests are fine (they inject the clock), but the live demo needs fresh exports. Resolve: a `make_demo_exports` script that writes the same messages relative to today, plus one real export.
   - G-04 Real Android and iPhone exports are missing in `fixtures/exports/real/`; architecture §12 says `ingestion` is not accepted without them. Resolve: each member exports one real chat today, names replaced.
   - G-05 NFR-03 one-week test and NFR-04 three-user test cannot run as written. Resolve: compressed NFR-03 run; NFR-04 session with Mahd + 2 classmates on 26 Nov.
   - G-06 OQ-04 and OQ-05 still open. Resolve with D-D; PRD v1.2 if OQ-05 is accepted.
   - G-07 Phone push needs HTTPS. Resolve per section 1.
   - G-08 CI wording in AGENTS.md assumes GitHub Actions. Resolve per section 1.
   - G-09 Ten PRD rules (BR-05, BR-14, BR-10 retries) are time-based. Demo needs a way to show them without waiting days. Resolve: tests with injected clock, plus a demo script that inserts a short-lived Event.
3. **Resolve gaps**, record each as Accept / change artefact, with the human decision and reason.
4. **Write `README.md` and `plan.md` (v01)** with: product objective; assumptions and open issues; slice backlog (section 4); priorities and order; dependencies; acceptance criteria by PRD AC id; slice status column; quality-gate column. Copy to `docs/plan-history/plan-v01.md`.
5. **Gate 1 for the whole plan:** every slice has scope, FR/BR links and AC ids before coding starts.

---

## 4. Vertical slice backlog (feeds plan.md)

Each slice crosses UI, API, module logic and database, and ends in something a User can see. Priority: M = Must for demo, S = Should, C = Could.

| ID | Slice (user-visible result) | FR / BR / NFR | ACs | Depends | Mode | Pri | Day |
|---|---|---|---|---|---|---|---|
| S00 | Walking skeleton: app shell loads, `/api/health` from DB, test + lint run | infra | – | – | AFK | M | 1 |
| S01 | Create account, sign in/out, see only own data | FR-01, BR-11 | 01.1, 01.2, 02.5 | S00 | HITL | M | 1 |
| S02 | Approve a Chat from an Android `.txt` export: preview name, choose Look-back, see "6 messages read"; bad files refused | FR-02, BR-01..03, BR-05 (file), BR-15, NFR-01 | 02.1, 02.3 (N1, F2) | S01 | HITL | M | 2 |
| S03 | Detected Events appear after upload (rule engine, English + Roman Urdu, Uncertain marks, Needs date) **+ NFR-05 gate** | FR-05, BR-12, BR-17, BR-20, BR-21, NFR-05 | 05.1..05.9, 05.12, 05.13 | S02 | HITL | M | 2 |
| S04 | Review a Detected Event: accept/correct Uncertain details, edit, confirm, dismiss; upcoming Events list | FR-06, FR-11, BR-05, BR-16 | 06.1..06.3, 06.5, 06.7, 06.8, 11.1, 11.2 | S03 | HITL | M | 3 |
| S05 | Update an Approved Chat, iPhone `.zip`, date-order question, Approved Chats list, Revoke | FR-03, FR-04, BR-02, BR-06, BR-15 | 02.2, 02.4, 03.1..03.3, 04.1, 04.2 (N2, B1, B2, F1, F3) | S02, S03 | AFK | M | 3 |
| S06 | Manual Event; edit/delete a Confirmed Event | FR-07, FR-12, BR-16 | 07.1, 07.2, 12.1*, 12.2* | S04 | AFK | M | 3 |
| S07 | Jobs + tick + in-app Reminders + Lead Time settings + timed deletions | FR-09 (in-app), FR-10, BR-05, BR-07, BR-08, BR-14, BR-19, NFR-03 | 09.1..09.5, 10.1..10.4, 05.11, 06.6 | S04, S06 | HITL | M | 4 |
| S08 | Possible Duplicate: add new / update existing / dismiss | BR-04, BR-13 | 05.10, 06.4* | S04 | AFK | M | 4 |
| S09 | Delete account (and everything owned) | FR-13, MF-07 | 13.1, 13.3 | S07 | AFK | M | 4 |
| S10 | Phone/desktop push notification via service worker, installable PWA | FR-09 (push), C-05 | 09.3 | S07 | HITL | S | 4 |
| S11 | Connect Google Calendar, one-way copies, retries, "Calendar update failed", unlink | FR-08, FR-13 (unlink), BR-09, BR-10, BR-18 | 08.1..08.3, 12.1, 12.2, 13.2, 06.4 | S07 | HITL | S | 5 |
| S12 | **New feature:** upload nudge for stale Approved Chats (OQ-05) | new FR-14 (PRD v1.2) | new AC-14.x | S07 | AFK | C | 5 |
| S13 | UI polish + Gate 5 end-to-end run + NFR evidence (NFR-02 timing, NFR-03 log, NFR-04 users) | NFR-02..04 | all | all | HITL | M | 5 |

`*` = the calendar part of that AC is closed in S11.

**HITL vs AFK rule** (put this sentence in plan.md): HITL when the slice has privacy risk, ambiguous rules or an external system (S01, S02, S03, S04, S07, S10, S11, S13). AFK when the rules are already exact and fixtures exist (S00, S05, S06, S08, S09, S12). AFK output is still human-reviewed before Accept.

**Cut line if we run late:** drop S12 first, then S10 (in-app Reminders still satisfy C-05), then S11 last (needs client agreement, see D-C).

---

## 5. Team ownership (proposal, change freely)

| Member | Leads | Also |
|---|---|---|
| Abdul Hannan Rauf | S00, S03 (detection), S07 (jobs/reminders), S13 | Stage 2 gap review, plan.md owner |
| Zain Amjad | S02, S05 (chats/ingestion), S08, S11 (Google) | real exports (G-04), NFR-02 timing |
| Muhammad Areeb | S01, S04 (review UI), S06, S09, S10, S12 | UI wireframes review, NFR-04 usability session |

Each lead runs (or at least drives the prompts of) their slices, makes the Accept/Revise/Reject call, and signs the evidence entry. AI work done in this Claude session must be logged under the member who directed it. **Evidence must be real.** Do not back-fill entries for work a member did not do.

---

## 6. Stage 3: AI-generated supporting artefacts (only what the code needs)

Generated autonomously, kept in `docs/design/`, no human review needed except UI:
- `api-contracts.md`: request/response shapes for the endpoints in architecture §6.2 (becomes `shared/contracts/http.ts`).
- `data-model.md` + SQL migrations: tables in architecture §5.2.
- `ui-wireframes.md`: screen list and low-fi wireframes. **The team reviews these** (allowed exception) and records changes requested.
- `test-ideas.md`: EP/BVA cases per slice (section 8).
Not generated: UML class diagrams, sequence diagrams beyond what exists, anything nobody reads.

### UI direction (from the ui-ux-pro-max rules)
- Product type: personal productivity tool, phone-first PWA, student users. Calm, clean, high-contrast, no decoration.
- Layout: mobile-first at 375 px, max content width about 640 px on desktop. Bottom navigation with 4 items, icon + label each: **Inbox** (Detected Events, badge count), **Events** (upcoming), **Chats** (Approved Chats + upload), **Settings** (Reminders, Google Calendar, account). Primary action per screen: "Upload Chat Export" on Chats, "Confirm" on a Detected Event.
- Colour: semantic tokens only (primary, surface, on-surface, warning, danger, success), light and dark themes via `prefers-color-scheme`, every pair at least 4.5:1. Primary: deep teal (not WhatsApp green, to avoid brand imitation). **Uncertain** uses amber plus an icon plus the word "Check this", never colour alone. Destructive actions (Revoke, Delete account) in red, separated from normal actions, with a confirm dialog.
- Type: system font stack (no web-font dependency), 16 px body, 1.5 line height, scale 12/14/16/20/24/32.
- Icons: inline SVG set in one file (a new icon package would need team approval under AGENTS.md §7). No emoji icons.
- Interaction: 44 px touch targets, 8 px spacing grid, loading state on every async button, errors under the field that caused them with cause and fix ("This file is not a WhatsApp Chat Export. In WhatsApp choose Export chat > Without media."), empty states with the next action ("No Approved Chats yet. Upload your first Chat Export."), `prefers-reduced-motion` respected, visible focus rings, labels on every input, password managers allowed.
- Guided upload screen for NFR-04: three numbered steps with a picture of WhatsApp's Export chat menu path, so a first-time User finishes in under 5 minutes without help.

---

## 7. Stage 4: the loop, and exactly what to save per slice

For **every** slice (this is 20 marks, do not skip steps):

| Step | Do | Save (in `evidence/slices/Sxx-name.md`) |
|---|---|---|
| 1 Select | Pick next slice from plan.md | Slice id, FR/AC ids, lead member, plan version used |
| 2 Load context | Give the agent only the relevant PRD sections, architecture sections, ADRs, AGENTS.md, prior code | The exact prompt + list of files given (copy into `evidence/prompts/Sxx-*.md`) |
| 3 Refine criteria/tests | Agent proposes tests; human trims/adds | Final AC list + EP/BVA table (filled before coding = **Gate 1**) |
| 4 Mode | HITL or AFK | One-line reason |
| 5 Implement | Agent writes code, iterates | Iteration notes: what went wrong, what the human asked to change |
| 6 Run checks | `npm test`, detection gate, manual UI check | Test output saved to `evidence/test-runs/Sxx-<date>.txt`, test evidence table filled (**Gate 2**) |
| 7 Review | Human checks behaviour, boundaries (`npm run lint`), ADRs, no extra features | **Gate 3** result + decision **Accept / Revise / Reject** + reason |
| 8 Integrate | Merge the slice branch into `main`, re-run full suite | Commit hash / merge commit, full-suite result (**Gate 4**) |
| 9 Update context | Update plan.md status, ADRs if design changed | New `plan-vNN.md` copy + commit |

**Git conventions:** one branch per slice (`slice/S03-detection`), commit messages start with the slice id (`S03: add Roman Urdu time words`), merge with `--no-ff` so integration shows in history. Tag accepted slices (`S03-accepted`).

**Plan history:** copy `plan.md` to `docs/plan-history/plan-vNN.md` and commit every time status, order, scope or decisions change. Expect 10 to 15 versions by 27 Nov. Each version has a 2-line "Changes since previous version" header.

**Revise/Reject evidence the demo explicitly asks for:** keep at least one real example. Likely candidates: the first detection run failing NFR-05 M3/M4 (Revise: fix rules, never edit the test set), or an agent adding a forbidden import / logging message text (Reject, caught by lint or review).

**AI chat evidence:** export this Claude Code session transcript at the end of each day into `evidence/ai-sessions/` and reference the slice ids inside it.

---

## 8. Testing and quality gates (lightweight, per the testing guide)

Gates per slice: G1 readiness, G2 functional, G3 architecture/constraints (`npm run lint` boundary rules + privacy checklist), G4 regression (full suite green on `main`), G5 final product check (S13).

Where EP and BVA are meaningful (and only there):

| Area | EP classes | BVA values |
|---|---|---|
| Password (Q-26) | valid / too short / empty | 7, 8, 9 chars |
| Look-back Period | 1, 3, 7 valid; others invalid | 0, 1, 7, 8 |
| Start Point | before / at / after | message at Start Point minute −1, same minute, +1 (R2-5) |
| Upload size | under / over limit | 4 MB −1 byte, 4 MB, 4 MB +1; inflated 8 MB |
| Read-up-to Point | old / same-minute-unread / new | AC-03.1 case B1 |
| Event date (BR-16) | past / today / future | yesterday, today with past time, today with future time, tomorrow |
| Bare hour (U1) | 1–7 PM, 8–11 AM, 12 noon | 7, 8, 11, 12 |
| Reminder Time | passed / future | confirm at Reminder Time −1 min, at, +1 (AC-09.4) |
| Reminder delivery | on time / late ≤10 min / missed | 0, 1, 10, 11 minutes late (Q-23) |
| Title length | ≤60 / >60 | 59, 60, 61 |
| Lead Time | 10m, 30m, 1h, 1d valid; others invalid | – |

Negative tests that matter: not-an-export, wrong Chat on update, upload to Revoked Chat, other User's Event id (404), confirm with unreviewed Uncertain detail, tick with wrong secret, past date.

The **detection gate** (80 messages, M1 to M4) runs in `npm test`. The TypeScript scorer must match `fixtures/detection/evaluate.py` (parity check). Never edit the CSV or thresholds.

Test evidence table (one per slice, inside the slice evidence file):

| Slice / Requirement | Test type | Input / condition | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|

---

## 9. Stage 5: final validation (26 Nov)

- **Gate 5 end-to-end script** (manual, with screenshots): new account → upload fresh SE-3D export → review 3 Detected Events including one Uncertain → confirm → Event in list → Reminder appears in-app (short Lead Time) → Google copy appears → update Chat with newer export → Possible Duplicate → Revoke → delete account.
- **NFR checks:** NFR-01 privacy test (inspect DB + logs after upload; script in `server/test/`), NFR-02 timing of 20 uploads (script), NFR-03 compressed reminder run (export table from `reminders` rows), NFR-04 three first-time users timed (Mahd + 2), NFR-05 gate result.
- Fix only critical failures after this; everything else goes to "Known issues" in the report.

---

## 10. Final submissions checklist (27 Nov)

| Item | Location |
|---|---|
| Working product + all source | `app/` (zip without `node_modules`) |
| Context: PRD.md (v1.2 if changed), architecture.md, AGENTS.md, ADRs (001–006+), README.md, final plan.md, design artefacts | `app/docs/`, `app/AGENTS.md`, `app/README.md`, `app/plan.md` |
| plan.md history | `app/docs/plan-history/plan-v01.md … vNN.md` + git log |
| Workflow Evidence Log | `app/evidence/workflow-evidence-log.md` (one row per slice, fields from the brief) + `evidence/slices/`, `evidence/prompts/`, `evidence/test-runs/`, `evidence/ai-sessions/` |
| Final Project Report (.docx) | scope, architecture/implementation summary, key challenges, **CCP analysis**, limitations/known issues, contribution summary |
| Run instructions + access info | `README.md` (install Postgres, `.env` example, `npm install`, `npm run migrate`, `npm run dev`, `npm run ticker`, test accounts, demo exports) |
| Group Contribution Log (.docx) | member → slices, AI interactions, decisions, fixes, integration |

### CCP analysis outline (report section)
- **Problem:** Event details are buried in bilingual (English + Roman Urdu) WhatsApp groups; WhatsApp has no permitted personal API; a calendar app or a regex does not solve it.
- **Complexity drivers:** informal Roman Urdu date/time language (kal, parson, sadhe, U1–U9 ambiguity rules); read-once across overlapping exports with minute-precision timestamps; time-based work (Reminders within 1 minute, timed deletions, retries) without an always-on server; strict privacy deletion rules across modules.
- **Trade-offs:** rule-based detection vs LLM (determinism, privacy, free vs flexibility and recall); export upload vs live WhatsApp access (permitted and safe vs not real-time); local demo vs cloud deployment (reliability vs phone push).
- **Alternatives:** LLM detection, unofficial WhatsApp clients, microservices, Vercel cron (all from ADR-001..004 reasoning).
- **Integration:** PWA ↔ API ↔ modules via outbox and tick ↔ Postgres ↔ Google Calendar ↔ Web Push.
- **Evaluation metrics:** NFR-05 M1–M4 scores, NFR-02 upload times, NFR-03 reminder lateness distribution, NFR-04 task times.
- **Scalability/feasibility:** one DB and one tick fine for hundreds of users; rules need maintenance per new slang; at scale move to a real queue and an always-on worker.
- **Ethics:** other group members never consented to their messages being read (mitigated by window, deletion, no logging, titles never copy text); account deletion; accessibility; cultural/language inclusion of Roman Urdu.

### Demo must show (from the brief)
Working product and main flows; promised FRs; plan.md history; slice decomposition; one full loop end to end (use S03 or S02); one revised/rejected AI output; integration of several slices; testing evidence; one CCP trade-off; individual contributions. Each member rehearses explaining the architecture, plan and one hard decision.

---

## 11. Day-by-day schedule

| Day | Date | Work | Plan versions |
|---|---|---|---|
| 1 | Sun 22 Nov | Decisions D-A..F; install Postgres; repo + context baseline; AI gap review; README + plan v01; S00; start S01 | v01–v03 |
| 2 | Mon 23 Nov | S01 finish; S02; S03 (detection + gate, expect a Revise loop); real exports in | v04–v06 |
| 3 | Tue 24 Nov | S04, S05, S06; wireframe review by team | v07–v09 |
| 4 | Wed 25 Nov | S07 (jobs, tick, reminders), S08, S09, S10 | v10–v12 |
| 5 | Thu 26 Nov | S11 Google, S12 nudge if time; S13 polish; Gate 5; NFR-02/03/04 runs | v13–v15 |
| 6 | Fri 27 Nov | Report + CCP, logs, zip, demo rehearsal, **submit early** (late penalty starts at minute 1: −20%) | final |

---

## 12. Proposed repo layout

```
ISE1003 WhatsApp Calendar Sync (Del 4)/app/
  AGENTS.md  README.md  plan.md  package.json (npm workspaces)  .env.example
  docs/  PRD.md  architecture.md  adr/  design/  plan-history/  decisions.md
  fixtures/  (D3 fixtures, unchanged)
  server/  src/app.ts  src/bootstrap.ts  src/shared/  src/modules/{identity,chats,ingestion,detection,events,reminders,calendar-sync,jobs}/  migrations/  test/
  web/  src/  public/sw.js  public/manifest.webmanifest
  scripts/  ticker.ts  make-demo-exports.ts  nfr02-timing.ts  nfr03-export.ts
  evidence/  workflow-evidence-log.md  stage2/  slices/  prompts/  test-runs/  ai-sessions/  contribution-log.md
```
(`api/index.ts` is dropped if D-B = local.)
