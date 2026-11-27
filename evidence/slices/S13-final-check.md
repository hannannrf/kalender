# S13: Gate 5 end-to-end run and NFR-02, NFR-03 and NFR-04 evidence

| Field | Value |
|---|---|
| Slice | S13 |
| Requirements | NFR-02, NFR-03, NFR-04; Gate 5 over all FRs; NFR-01 and NFR-05 confirmed again |
| Plan version used | v12 |
| Lead | Abdul Hannan Rauf |
| Mode | HITL: the deployed product, a real Google account, and a usability session with real people |
| Agent | Claude Code (Opus 5.5) |
| Branch | `slice/S13-final-check` |
| Date | 27 Nov 2026 |

## 1. Select

S13 is the last Must slice. All other Must and Should slices (S00 to S11) are accepted. S12 (Could) waits until S13 is done, and is the first slice to cut if time runs out (plan.md cut line).

## 2. Context loaded

- PRD:
  - NFR-02: Detected Events appear within 60 seconds for at least 19 of 20 uploads of up to 10,000 lines with up to 300 messages to read;
  - NFR-03: at least 98% of Reminders are presented no earlier than their Reminder Time and no later than 1 minute after it;
  - NFR-04: three first-time Users each export, approve and confirm within 5 minutes without help;
  - NFR-01 and NFR-05 are already gated by automated tests (`chats.test.ts`, `nfr05.gate.test.ts`).
- D4 master plan section 9: the Gate 5 end-to-end script and the NFR checks; section 1: NFR-03 is compressed from one week to about one hour, because the course has no week left.
- plan.md v12:
  - O-3: the Android half of the real exports is still open;
  - O-5: cron-job.org is not set up;
  - O-6: the NFR-04 session is not run yet;
  - S10 risk: a job backlog slows the tick from Vercel to Neon `dev`.

## 3. Criteria and tests (to agree before coding, Gate 1)

| ID | Criterion | Check |
|---|---|---|
| S13-1 (Gate 5) | On production, with a new throwaway account, run the end-to-end script without a blocking problem, with a screenshot at each step:<br>1. upload the SE-3D sample export;<br>2. review its Detected Events, including one with an Uncertain detail;<br>3. confirm them;<br>4. see them in the Events list;<br>5. see an in-app Reminder at a short Lead Time;<br>6. see the Google copy;<br>7. update the Chat with the newer export and get a Possible Duplicate;<br>8. Revoke the Chat;<br>9. delete the account. | manual run, screenshots |
| S13-2 (NFR-02) | On the S13 preview, 20 generated Android exports, each 10,000 lines with 300 messages inside the 7-day Look-back, are uploaded one after another. At least 19 of them show their Detected Events within 60 seconds. Each time runs from the start of the upload request to the moment the Detected Events list answers, so it includes the file transfer. | script `scripts/nfr/nfr02.sh`, table of 20 times |
| S13-3 (NFR-03, compressed) | On the S13 preview, 50 Manual Events with a 30-minute Lead Time give 50 Reminders, one per minute over about 50 minutes. A script on this PC calls `/internal/tick` every minute. At least 49 of the 50 Reminders (98%) are presented no earlier than their Reminder Time and no later than 60 seconds after it, as recorded in the `reminders` rows. | script `scripts/nfr/nfr03.sh`, query of the `reminders` rows |
| S13-4 (NFR-04) | Mahd and two classmates, each new to Kalender, export a Chat from WhatsApp, approve it on production and confirm one Detected Event, each within 5 minutes of account creation, with no help. | run sheet `evidence/slices/S13/nfr04-run-sheet.md`, filled in by the team |
| S13-5 (NFR-01, NFR-05) | The NFR-01 privacy test and the NFR-05 detection gate pass on `main` in CI. | CI |
| S13-6 | Gate 5 problems that block a User are fixed in this slice. Every other problem is listed as a known issue. | evidence section 6 |

## 4. HITL or AFK

HITL. Decisions for the human before the runs:
1. **NFR-03 run:** use the S13 preview and a tick script on this PC, or production with cron-job.org (O-5).
2. **NFR-04:** the agent cannot run it, because it needs real people watched.
3. **Where to run Gate 5:** on production or on a preview.
4. **O-3:** whether a real Android export is available for Gate 5.

### Gate 1 decision (27 Nov 2026)

Abdul Hannan Rauf answered through the agent's question form:
- NFR-03: "Preview + PC ticker". The run uses the S13 preview on Neon `dev`, with a throwaway account and a script on this PC that calls the tick every minute. O-5 stays open;
- NFR-04: "Run today, I prep sheet". The agent writes a run sheet and a timing table. The team runs the session today on production and sends the agent the three times;
- Gate 5: "Production". The agent drives it with a throwaway account, Abdul Hannan Rauf gives the Google consent, and the account is deleted at the end;
- O-3: "No, record the gap". Gate 5 uses the Android-format sample SE-3D export. The Android half of O-3 stays open.

## 5. AI implementation

Prompt: "Run S13 from plan.md v12 and the Gate 1 decisions in this file: the Gate 5 end-to-end script on production, NFR-02 with 20 generated exports on the S13 preview, a compressed NFR-03 run of 50 Reminders on the S13 preview with a tick from this PC, and an NFR-04 run sheet for the team. Fix only problems that block a User; list the rest as known issues."

What the agent built:
- **Tick order (found before the NFR-03 run):**
  - **Problem:** one tick on the S13 preview took 171 seconds. Neon `dev` held 639 pending `expireDetected` jobs left by earlier test runs, and the tick ran up to 50 due jobs (about 3 seconds each from Vercel to Neon) *before* it delivered Reminders.
  - **Hidden by the record:** `reminders.delivered_at` holds the tick's start time, so a slow tick would still have looked on time.
  - **Fix, approved by Abdul Hannan Rauf ("Fix tick order"):** the tick now runs the outbox, then tick tasks such as Reminder delivery, then due jobs within a 20-second budget. Test S13-3 checks that a due job sees the Reminder already sent. Architecture section 6.3 is updated.
  - **Measurement:** NFR-03 is measured from `in_app_notifications.created_at`, the time the in-app Reminder was written, not from `delivered_at`.
- **Scripts:**
  - `scripts/nfr/make_nfr02_exports.py` and `nfr02.sh`: 20 made-up Android exports and the timed upload run;
  - `scripts/nfr/nfr03.sh` and `server/scripts/nfr03-report.mjs`: the Reminder run and its report;
  - `scripts/nfr/make_gate5_exports.py`: the SE-3D sample moved to today's dates, plus the newer export with "kal 5 baje project meeting hai".
- **Run sheet:** `evidence/slices/S13/nfr04-run-sheet.md`.

## 6. Checks

### S13-1, Gate 5 on production (27 Nov 2026, 4:50 to 5:15 pm PKT)

Production at `bc30573` (S11 merge, before the S13 tick fix). Abdul Hannan Rauf created a throwaway account and picked the export files in the file picker, because the agent does not type test credentials on the production site. He gave the Google consent and deleted the account at the end. The agent drove every other step.

| Step | Result | Screenshot |
|---|---|---|
| Chats shows the export steps; the SE-3D export is chosen | Preview: name "SE-3D Class" from the file name, 7 days | `gate5-01`, `gate5-02` |
| Approve | "SE-3D Class approved. 6 messages read." | `gate5-03` |
| Inbox | 3 Detected Events: Proposal submission (Fri 27 Nov, All day), Meeting (Sat 28 Nov, 3:00 pm, Room 4), OOP lab (Sun 29 Nov, 2:00 pm, Room C-204, "Check this") | `gate5-04` |
| Review the Uncertain one | OOP lab: "The day name does not match the date; the date is used." "Keep Sun 29 Nov", then Confirm Event | `gate5-05`, `gate5-06` |
| Confirm a second one | Meeting confirmed; Events list shows Kal: Meeting, Parson: OOP lab | `gate5-07` |
| Reminder | Lead Time set to 10 minutes; Manual Event "Gate 5 reminder check" at 5:06 pm; the production tick at 4:56:05 pm presented the in-app Reminder | `gate5-08` |
| Google copy | Connect, consent; Meeting (28 Nov, 3 to 4 pm, Room 4), OOP lab (29 Nov, 2 to 3 pm, Room C-204) and the reminder Event are in Google Calendar | `gate5-09` |
| Update the Chat with the newer export | "Updated. 1 message read." (The first try picked the older file again and correctly said "No new messages since the last upload.") | `gate5-10` |
| Possible Duplicate | "Project meeting", Sat 28 Nov, 5:00 pm with "Check this" (no am or pm) and "Possible Duplicate" of Meeting. "Keep 5:00 pm", then "Update the existing Event": Meeting moves to 5:00 pm and keeps Room 4 (D-28); its Google copy moves to 5 to 6 pm | `gate5-11` to `gate5-13` |
| Revoke | "Revoke SE-3D Class? Its Detected Events and their message text are deleted. Confirmed Events stay." Afterwards the Inbox is empty and both Confirmed Events stay | `gate5-14`, `gate5-15` |
| Delete account | Sign-in shows "Your account and everything in it are deleted." | `gate5-16` |

Found during Gate 5 (not blocking, so known issues per S13-6):
- **O-5 matters on production.** After Connect, Meeting and the reminder Event reached Google at once, but OOP lab waited in the outbox: the callback sends the copies for at most 4 seconds per pass, and production has no per-minute tick yet. The next manual tick sent it. Reminders on production likewise need the tick. cron-job.org (O-5) must be set up before the NFR-04 session.
- **Production is slow.** Confirming an Event or loading the Events list took about 5 to 10 seconds, from the Vercel function to the Neon production branch. This is the open Vercel region question from S10.

### S13-2, NFR-02 on the S13 preview (28 Nov 2026)

Preview `kalender-mwok9x4cv` at `ad0baf1`, Neon `dev`, one throwaway account. The 20 exports were made just before the run, so their 300 recent lines fall inside the 7-day Look-back. Full table: `evidence/slices/S13/nfr02-report.md`.

| Measure | Result |
|---|---|
| Uploads answered 201 | 20 of 20 |
| Time from upload start to the Detected Events list (upload plus list request) | 32.9 to 42.4 seconds, all within 60 seconds |
| Messages read per upload | 254 to 271 of the 300 recent lines; the rest are "<Media omitted>" and "This message was deleted", which Kalender does not read (34 of them in Chat 01, which read 266) |
| Detected Events per upload | 41 to 55 |

**Result: pass, 20 of 20 within 60 seconds (NFR-02 needs 19 of 20).** About 95% of each time is the upload request, which reads and stores the Chat and runs detection; the list request takes 1 to 3.5 seconds. The Detected Events count is higher than the 30 Event messages in each file, because some chatter lines such as "sir aaj late aayenge" are also detected. Detection accuracy is NFR-05's job, not this check's.

A first try at 1:30 am on 28 Nov used exports made the day before; one upload ran (33.4 seconds) before the agent stopped it to make fresh exports.

### S13-3, NFR-03 on the S13 preview (27 Nov 2026)

Preview `kalender-6vcebd3eq` (with the tick fix), Neon `dev`, one throwaway account, 50 Manual Events whose Reminders fell one per minute from 11:48 to 12:37 UTC. `scripts/nfr/nfr03.sh` on this PC called the tick at 2 seconds past each minute. Lateness is measured from `in_app_notifications.created_at`. Full table: `evidence/slices/S13/nfr03-report.md`.

| Measure | Result |
|---|---|
| Reminders presented | 29 of 50 (Reminders 1 to 29) |
| Late by, for the 29 presented | 6.9 to 10.4 seconds, median 9.0 seconds; none early, none after 60 seconds |
| Reminders 30 to 50 | still scheduled: the tick script stopped at about 12:15 UTC, when the agent session on this PC ended |

**Result: not fully checked.** All 29 Reminders that a tick reached were on time (100% of those), but the run covers 29 of the planned 50. Against the planned 50 it is 58%, below the 98% that NFR-03 needs. Abdul Hannan Rauf chose on 28 Nov to record the 29 as they are and not to run the 55-minute check again ("Record 29 as is"). What the run shows is that a Reminder is presented within one tick of its Reminder Time when the tick runs every minute. What it cannot show is whether the tick runs every minute for a week on production; that depends on cron-job.org (O-5), which is not set up yet.

### S13-4, NFR-04 (not run yet)

The run sheet is ready (`evidence/slices/S13/nfr04-run-sheet.md`). The session with Mahd and two classmates has not been run, so NFR-04 is not checked. It also needs O-5 on production first, because Reminders and Google copies on production wait for the tick (see Gate 5).

### S13-5, NFR-01 and NFR-05 in CI

CI on `main` at `bc30573` (S11 merge) and on each S13 commit (last `ad0baf1`) passed. The run includes `chats.test.ts` (13 tests, among them the NFR-01 check that no message text or sender is stored for the Chat, only fingerprints) and `nfr05.gate.test.ts` (9 tests, with the 80 of 80 detection gate and the `evaluate.py` re-score). **Result: pass.**

### S13-6, problems found

No problem blocked a User, so no product code changed in S13 except the tick order (section 5), which changed what the NFR-03 run measures. Known issues:
1. O-5: production has no per-minute tick, so Reminders, retries and some Google copies wait. This must be set up before Kalender is used for real and before the NFR-04 session.
2. Production responses take about 5 to 10 seconds (Vercel function to the Neon production branch).
3. O-3: no real Android export was checked; the Android format is covered by the sample and generated exports.
4. NFR-03 covers 29 Reminders over 29 minutes, not 50 over a week.

### Summary

| Criterion | Result |
|---|---|
| S13-1 Gate 5 on production | pass |
| S13-2 NFR-02 | pass, 20 of 20 |
| S13-3 NFR-03 | not fully checked: 29 of 29 ticked on time, 29 of 50 run |
| S13-4 NFR-04 | not run |
| S13-5 NFR-01, NFR-05 | pass |
| S13-6 | done, 4 known issues |
