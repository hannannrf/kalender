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
