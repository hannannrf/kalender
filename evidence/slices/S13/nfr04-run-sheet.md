# NFR-04 run sheet: three first-time Users

**Requirement (NFR-04):** Each of three first-time Users exports a Chat from WhatsApp, approves it in Kalender and confirms one Detected Event within 5 minutes. Each User uses only the on-screen guidance and gets no help from another person. The test passes only if all three succeed.

**Who:** Mahd and two classmates who have never used Kalender.
**Observer:** one team member with a phone stopwatch. The observer does not touch the participant's phone and does not answer questions about the task.
**Where:** production, https://kalender-tan-eta.vercel.app, opened on the participant's own phone.

## Before each session

1. Make sure the participant has a WhatsApp group with at least one message in the last 7 days that names a meeting, quiz or deadline with a future date. A class or project group usually has one.
2. The participant opens the link and creates an account with any email and password. **Timing starts when the account is created** (NFR-04).
3. Read the participant this sentence, and nothing more: "Please get one meeting or deadline from your WhatsApp group into Kalender and confirm it. I can't help you; just think aloud."

## During the session

Write down the time on the stopwatch at each step. If the participant asks for help, say "Do what you think is right" and write down the question.

| Step | What counts as done |
|---|---|
| A. Export | WhatsApp's "Export chat" (without media) has produced the file |
| B. Approve | Kalender shows the Chat as approved and says how many messages it read |
| C. Confirm | One Detected Event is confirmed and appears in the Events list |

**Stop the stopwatch at C.** The run fails if C is not reached within 5:00, or if anyone helped.

## Results

| Participant | Phone (Android or iPhone) | A. Export (m:ss) | B. Approve (m:ss) | C. Confirm (m:ss) | Within 5:00 | Help asked or given | Problems seen |
|---|---|---|---|---|---|---|---|
| Mahd | | | | | | | |
| Classmate 1 | | | | | | | |
| Classmate 2 | | | | | | | |

**NFR-04 result:** pass only if all three rows are "yes" for within 5:00 and "none" for help.

## After each session

- In Settings, the participant chooses **Delete account**, or keeps the account if they want to use Kalender.
- Do not copy any message text or Chat name into this sheet. Write the problem in your own words (for example "did not find the Approve button").
- Send the filled table to the agent, or paste it into `evidence/slices/S13-final-check.md` section 6.
