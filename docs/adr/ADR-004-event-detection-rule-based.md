# ADR-004: Rule-based, deterministic Event detection as a pure module

**Status:** Accepted

## Context

FR-05 must detect Events in English and Roman Urdu messages, interpret dates and times by BR-12, apply the Event criteria (BR-20), and mark Uncertain details by rules U1 to U9 (BR-21). NFR-05 measures it on a fixed 80-message Detection Test Set with thresholds M1 to M4, and AC-05.8 says a run that misses any threshold fails. Privacy (G-03, NFR-01) means message text should not leave the system. Everything must be free (C-03).

**Drivers:** FR-05, NFR-05, BR-12, BR-20, BR-21, NFR-01, NFR-02, C-03.

## Alternatives considered

| Alternative | For | Against |
|---|---|---|
| A. **Rule-based parser** (tokeniser plus English and Roman Urdu vocabularies plus date/time grammar plus the U1–U9 rules) | Deterministic: the same message always gives the same answer, so NFR-05 results are repeatable. Each BR-12/BR-21 rule maps to code and a test. Free, fast (milliseconds) and offline. | Misses wording the rules do not cover; recall depends on vocabulary work; Roman Urdu spelling varies ("jumma", "jummay", "jumay"). |
| B. Free-tier LLM API (for example Gemini) | Better with messy and unseen wording | Not deterministic, so NFR-05 runs can differ. It sends Chat text to a third party (against G-03 and the spirit of NFR-01), has free-tier rate limits and terms that change, and is hard to make follow U1–U9 exactly. |
| C. Rules first, LLM fallback for messages the rules cannot parse | Better recall | Has all of B's privacy and determinism problems for the fallback path, plus two systems to test. |
| D. A general NLP date library (for example chrono-node) alone | Good English date parsing | No Roman Urdu ("kal", "parson", "sadhe 4", "shaam"), no Event criteria, and no Uncertain marks. Could be used inside A for English dates only. |

## Decision

1. Detection is a **rule-based, deterministic** module `detection` with **one public function**:

   `detect(text: string, sentAt: DateTime /* PKT */) → DetectedEventDraft[]`

   Each draft holds title, date or "Needs date", time or All-day, place (if found) and `uncertain: Set<'date' | 'time' | 'event'>`, plus the rule ids that fired (for example `U1`), for explanation and testing.
2. The module is **pure**: no database, network, clock or logging of text. The sent time is passed in, never read from the system clock.
3. The rules are organised as in the PRD so each can be traced:
   - **Event criteria:** BR-20 activity words, past-tense check, question check.
   - **Date rules:** BR-12.
   - **Time rules:** BR-12.
   - **Uncertainty rules:** U1–U9, period phrases giving "Needs date".
   - **Vocabularies** as data (English and Roman Urdu word lists with spelling variants), so they can grow without changing logic.
4. **Acceptance gate:** the Detection Test Set (`detection_test_set.csv`) and the scorer (`evaluate.py` logic, ported into the test suite) run in CI. A change that drops any NFR-05 metric below threshold fails the build. The test set is not edited to make a run pass (NFR-05).
5. No LLM or external NLP service is used. Adding one requires a new ADR (AGENTS.md).

## Rationale

- NFR-05 and AC-05.8 need repeatable measurement; only a deterministic detector gives the same score on every run.
- Uncertain marks must follow exact rules (BR-21). In a rule engine they are explicit outputs, not guesses about a model's confidence.
- The privacy and cost constraints rule out sending Chat text to an external model.
- Detection being pure and isolated keeps it independent from storage and lets the team grow vocabularies safely.

## Trade-offs / consequences

- Recall depends on vocabulary coverage. Mitigations:
  - the PRD's preference for extra suggestions over misses (D-13/Q-24) lets rules be broad, within M4's limit of at most 4 false suggestions in 20;
  - the Uncertain review (FR-06) catches doubtful interpretations;
  - Mahd's real messages are used to grow the word lists.
- Messages outside the rules will be missed, a known limit compared with an LLM. It is measured honestly by M1.
- Rules are code, so every new rule needs a test case. This is a deliberate cost.
- If a later version wants an LLM, it must go through a new ADR covering privacy, determinism and cost.

## Revision: context v1.1 (after AI-agent validation)

- **Title and place (Q-5):** a draft's title is built from the matched activity words and their qualifier, at most 60 characters ("Project meeting", "Lab report due"). It is **never** the raw message, so no message text survives confirmation (BR-05). Place is taken only from an explicit location phrase ("in Room 4", "Room C-204", "library mein", "ground pe"), at most 40 characters. If no activity words qualify, the title is the activity word alone ("Meeting").
- **Scoring rules (Q-7):**
  - `fixtures/detection/detection_test_set.csv` and the reference scorer `evaluate.py` are supplied with the context, and the TypeScript test ports the scorer exactly;
  - a message counts as detected if at least one draft is returned, and M2 and M3 use the draft with the expected date if there is one, otherwise the first draft;
  - **extra** Uncertain marks do not fail M1–M4, but the AC-05.1 and AC-05.2 tests require none for those two messages.
- **Urdu script (Q-29):** `detect` returns no drafts for text written in Urdu script (AC-05.5); `ingestion` does not filter by script.
