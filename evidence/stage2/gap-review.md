# Stage 2: AI gap review of the approved context

| Field | Value |
|---|---|
| Date | 23 November 2026 |
| Agent | Claude Code (Opus 5.5), session "Intro to SE Deliverable 4 plan" (transcript: `evidence/ai-sessions/2026-11-23_phase1-planning-session.zip`) |
| Human reviewer | Abdul Hannan Rauf (decides Accept / Change for each finding) |
| Context reviewed | `docs/PRD.md` v1.1, `docs/architecture.md` v1.2, `AGENTS.md`, `docs/adr/ADR-001..005`, `fixtures/README.md` |
| Also checked against | D4 brief, D4 essential instructions, D4 testing and quality gates, the Phase 1 decisions approved on 23 Nov (`docs/decisions.md`) |

## Prompt given to the agent

> Review PRD.md, architecture.md, AGENTS.md and the ADRs for gaps, ambiguities, contradictions and missing decisions before implementation. Check them against the D4 brief (vertical slices, plan.md history, evidence), the testing guide (EP/BVA, quality gates), the timeline (deadline 27 Nov 2026) and the Phase 1 decisions the team approved today: product name Kalender, Vercel + GitHub, the "Chat colours" UI direction, the approved stack, and no Gemini/LLM in the product. For each finding give the evidence, the risk, and a proposed resolution. Do not change requirements silently.

## Findings and resolutions

| ID | Finding (evidence) | Risk | Proposed resolution | Human decision |
|---|---|---|---|---|
| G-01 | Product is called "WhatsApp & Calendar Sync" in PRD, architecture and AGENTS.md; the approved name is **Kalender**. "WhatsApp" in a product name is a Meta trademark. | Docs and UI diverge from the product; trademark risk. | Rename the product in all context files. Keep "WhatsApp Chat Export" only as a description of the input file (nominative use). Log as D-20. | **Accept** |
| G-02 | The approved UI direction gives each Approved Chat its own colour. No data field or rule for this exists (architecture §5.2 `approved_chats`). | Colour assignment invented ad hoc in code; no owner. | Add `colour` to `approved_chats`, owned by `chats`, assigned from a fixed 8-colour palette in approval order (next unused colour, wrapping). Manual Events use neutral grey. Confirmed Events store the colour with the Source Chat name so they keep it after a Revoke. Architecture §8 updated. | **Accept** |
| G-03 | AGENTS.md §2 fixes the stack but says nothing about styling or fonts. | Agent may add Tailwind or a UI kit. | Add to AGENTS.md §2: CSS Modules plus one `tokens.css`; Google Fonts Bricolage Grotesque and DM Sans; Tabler icons as inline SVG (no icon package). | **Accept** |
| G-04 | ADR-002 and AGENTS.md assume Vercel, Neon and cron-job.org. Phase 1 confirmed this (it had been reconsidered as local-only on 22 Nov). | None now. | No ADR change. Note in `docs/decisions.md` that local-only deployment was considered and rejected (D-21). | **Accept** |
| G-05 | All sample exports and the Detection Test Set are dated October 2026. With a 7-day Look-back Period, uploading them in a late-November demo reads nothing. Tests are unaffected because they inject the clock. | Live demo shows "no new messages". | Add `scripts/make-demo-exports` that writes the same sample messages dated relative to today. The fixtures themselves stay unchanged. | **Accept** |
| G-06 | `fixtures/exports/real/` is empty; architecture §12 and R2-18 say `ingestion` is not accepted without one real Android and one real iPhone export. | Ingestion accepted on synthetic data only. | Team exports one real chat per phone type (names replaced) before S02 is accepted. Owner: Zain. | **Accept** (team action) |
| G-07 | NFR-03 asks for 50 Reminders over one week; NFR-04 for three first-time Users. Only 4 days remain. | Unverifiable NFRs at the demo. | NFR-03: compressed run of 50 Reminders over about one hour on the deployed app, recorded from `reminders` rows; deviation documented. NFR-04: session with Mahd and two classmates on 26 Nov. | **Accept** |
| G-08 | OQ-04 (Snooze) and OQ-05 (upload nudge) are still open. | Scope creep or a missing improvement. | Snooze stays out (NG-07). OQ-05 becomes Could-have slice S12, added to the PRD only if it is implemented. | **Accept** |
| G-09 | Local development and the test suite need a PostgreSQL database; none is installed locally and no Neon project exists yet. | S01 onwards cannot run. | Neon free project with two branches: `dev` (local `.env.local` and tests) and `main` (production). CI keeps the Postgres service container. S00 runs without a database. | **Accept** (user creates the Neon account) |
| G-10 | AGENTS.md §6 requires an automated test per AC. ACs about push on a real phone and Google Calendar copies cannot run in CI. | Gate 2 blocked by untestable ACs. | Already allowed by R2-16 for UI ACs. Extend: push and Google ACs are verified by a manual checklist row with a screenshot in the slice evidence. | **Accept** |
| G-11 | The D4 brief requires `plan.md` with retrievable history and per-slice evidence; the D3 context has no `plan.md` or evidence structure. | Marks deduction for missing plan history. | `plan.md` at the repo root, copied to `docs/plan-history/plan-vNN.md` on every meaningful change; `evidence/workflow-evidence-log.md` with one row per slice. | **Accept** |
| G-12 | The Detected Event review UI in the approved mock shows the field explanation ("kal" means tomorrow, "5 baje" has no am or pm). Detection returns rule ids (ADR-004) but the PRD does not require user-facing explanations. | None (improvement), but it needs a source. | Detection keeps returning rule ids; the PWA maps rule ids to short explanations. No PRD change, because BR-12 already says every interpretation is shown before confirmation. | **Accept** |
| G-13 | Deadline risk: 14 slices in about 3.5 days. | Unfinished promised features. | Cut order in plan.md: S12 first, then S10 (push), then S11 (Google Calendar) last, each cut requiring a PRD note and client confirmation. | **Accept** |

No contradictions between the PRD, architecture, ADRs and AGENTS.md were found beyond G-01 to G-03. The two D3 agent validation runs (architecture §14 and §15) had already resolved 47 questions.

## Changes made because of this review

- `docs/decisions.md` created (D-20 to D-25).
- `docs/PRD.md` v1.2: product renamed (G-01); no requirement changed.
- `docs/architecture.md`: name (G-01), chat colour (G-02), styling (G-03).
- `AGENTS.md`: name, styling and font rules (G-03), test rule (G-10), evidence and Git workflow (G-11).
- `plan.md` v01 written with the slice backlog and cut order (G-11, G-13).
