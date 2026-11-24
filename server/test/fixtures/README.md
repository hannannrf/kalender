# Test fixtures (use unchanged)

| Path | What | Used by |
|---|---|---|
| `detection/detection_test_set.csv` | The 80-message Detection Test Set (PRD Appendix A). Sent time for all messages: Monday 19 Oct 2026 10:00 PKT. | `detection` gate test (NFR-05, AC-05.8) |
| `detection/evaluate.py` | Reference scorer for M1–M4. The TypeScript gate test must give the same results. | `detection` |
| `exports/samples/` | Sample Chat Exports (Android `.txt`, iPhone `.zip`, invalid files), made by `exports/make_samples.py` | `ingestion`, `chats` |
| `exports/real/` | Real exports with names replaced, added by the team | `ingestion` |

## Demo cases → acceptance criteria

Approval time for all cases: Monday 19 Oct 2026 10:25:40 PKT.

| Case | Input | Expected | AC |
|---|---|---|---|
| N1 | Approve `WhatsApp Chat with SE-3D Class.txt`, look-back 7 days | 6 text messages read (14 Oct 11:30 … 19 Oct 10:25 "noted") | AC-02.1 |
| N2 | Approve `WhatsApp Chat - ISE Project Team.zip`, look-back 3 days | 2 messages from Zain read; photo never inflated | AC-02.2 |
| B1 | Then update SE-3D Class with `v2/WhatsApp Chat with SE-3D Class.txt` at 22 Oct 09:00 | Exactly 3 new messages read, including the new 19 Oct 10:25 one | AC-03.1 |
| B2 | Approve `WhatsApp Chat with Society Core.txt` | `NEEDS_DATE_ORDER`; after DMY, only the 12 Oct message is read | AC-02.4 |
| F1 | Update SE-3D Class with `WhatsApp Chat with Ammi.txt` | `WRONG_CHAT`; pointers unchanged | AC-03.2 |
| F2 | Approve `notes.txt` and `WhatsApp Chat with Fake.txt` | `NOT_AN_EXPORT`; no Chat created | AC-02.3 |
| F3 | Revoke ISE Project Team, then upload its export as an update | `CHAT_NOT_APPROVED` | AC-04.2 |
| R1 | `real/WhatsApp Chat - Binary tree.zip` (real iPhone export, names, links and roll numbers replaced), approved at Mon 23 Nov 2026 20:00 PKT | Month/day found without asking; 299 text messages; 37 read with 7 days, 11 with 1 day | R2-18 |

## Detection scoring rules

- A message counts as detected if detection returns at least one draft.
- M2 and M3 use the draft with the expected date if there is one, otherwise the first draft.
- `uncertain` lists the marks that must be present; extra marks do not fail M1–M4, but AC-05.1 and AC-05.2 require none.
- `needs_date = Y` requires the draft to be in "Needs date".
