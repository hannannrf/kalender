# ADR-003: Chat ingestion and the privacy boundary for message text

**Status:** Accepted

## Context

Since PRD v1.1, WhatsApp messages enter only as Chat Exports uploaded by the User (C-02, D-14). An export contains the **whole history** of a Chat, but the system may read only messages sent at or after the Start Point and not read before (BR-02). It must ignore media and WhatsApp notices (BR-03), refuse wrong or invalid files without storing anything (BR-15), and delete the uploaded file as soon as it is processed (BR-05). NFR-01 is verified by inspecting stored data **and logs**, so message text leaking into logs, temp files or error reports fails the requirement.

The PRD describes behaviour; the architecture must decide **where** export files and message text may exist, and **which module** knows WhatsApp's file format.

**Drivers:** NFR-01, NFR-02, BR-01, BR-02, BR-03, BR-05, BR-15, C-02, FR-02, FR-03.

## Alternatives considered

| Alternative | For | Against |
|---|---|---|
| A. Store the uploaded file (for example in blob storage) and process it later in a background job | Upload returns fast; can retry | The whole Chat history is stored, including messages before the Start Point, so NFR-01 fails. A free blob store is also another service. |
| B. Parse the export on the phone (in the PWA) and send only eligible messages to the API | Pre-Start-Point text never leaves the phone | The read-once pointers live on the server, so the client would need them first. Parsing logic would be duplicated or moved to the client, which is harder to test and trust, and the server would have to trust whatever the client says was eligible. |
| C. Store all parsed messages and filter later | Simple | Breaks BR-02 and BR-05 directly. |
| D. **Parse in memory inside the upload request; keep only eligible text messages; never write the file** | Pre-Start-Point text is only ever in process memory for the length of one request, and nothing is persisted. Read-once logic stays in one place. | The upload request does all the work, so the file must fit the request size and time limits (ADR-002). |

## Decision

1. **Single format owner:** the `ingestion` module is the **only** code that understands WhatsApp's export format (Android `.txt`, iPhone `.zip` containing `_chat.txt`, date order, multi-line messages, media and notice lines). It is a set of **pure functions** with no database or network access:
   - `parseExport(bytes, filename, dateOrder?) → Parsed | Rejected | NeedsDateOrder`
   - `selectEligible(parsed, pointers) → { eligible, newPointers }`
2. **Chat state owner:** the `chats` module owns Approved Chats (Approval Time, Look-back Period, Start Point, Read-up-to Point, last upload time, Revoked state). It runs the approve and update use cases:
   - call `ingestion`;
   - check the Chat name (BR-15);
   - pass eligible messages to `events.ingestMessages(...)`;
   - save the new pointers.

   The pointers are saved **only after** `events` has stored the results, in one transaction, so a failed check is re-read next time (BR-02).
3. **No file persistence:** upload bodies are held in memory only (no disk temp files, no blob storage, no upload logging). The `.zip` media entries are never opened or decompressed.
4. **Message text boundary:**
   - Text of eligible messages may be stored **only** by the `events` module, as Source Messages linked to a Detected Event, and only under BR-05 and BR-14. Text of messages that produce no Event is never stored.
   - **No module may log, trace or return message text in error responses.** Logs carry ids, counts and timings only.
5. **Day/month ambiguity:** `ingestion` returns a `NeedsDateOrder` result, and the PWA asks the User (BR-15) before anything is read.

## Rationale

- Option D is the only one where the server provably never keeps out-of-window text, which matches how NFR-01 is tested.
- Keeping the format knowledge in one pure module means a WhatsApp format change (new marker text, new date style) is fixed in one place and covered by tests against sample and real exports.
- Splitting `ingestion` (pure parsing) from `chats` (state) lets read-once logic be unit-tested without a database.

## Trade-offs / consequences

- The full export passes through server memory during the request. This is accepted, as the alternative (client-side filtering) moves trust to the client.
- Upload limits: up to 4.5 MB per request (ADR-002) and NFR-02's 10,000 lines. Bigger files are refused with guidance ("Export Without media").
- A real export from Android and iPhone must be added as a test fixture before the parser is considered done. The demo samples are built to match the format but are synthetic.
- Encrypting Source Message text at application level was considered and rejected for this scope. Text is short-lived (BR-05), and the managed database encrypts storage at rest.

## Revision: context v1.1 (after AI-agent validation)

- **Preview before approval (Q-4):** `POST /api/chats/preview` runs `parseExport` and returns only the Chat name from the file and whether the date order is needed, storing nothing. The PWA keeps the file in a JavaScript variable until the User confirms, then sends it again to approve. Parsing twice is accepted; it keeps the "show the name before reading" rule (BR-15) without any server-side state.
- **Chat identity (Q-14):**
  - `name_from_file` is stored separately from the confirmed display name, and update uploads are compared on it;
  - a WhatsApp group renamed after approval gives `WRONG_CHAT`, and the User revokes and re-approves;
  - a User cannot have two non-Revoked Chats with the same `name_from_file` (`DUPLICATE_CHAT`).
- **Media in a .zip (Q-13):** a `.zip` that includes media is accepted if it is under the 4 MB limit. Only `_chat.txt` is inflated, using `fflate`'s entry filter.
- **Boundary minute (Q-25):** `ingestion` computes a SHA-256 fingerprint of minute, sender and text, and `chats` stores a **count per fingerprint**, so two identical "ok" messages in the same minute are both handled. The hash is not reversible and holds no readable text.
