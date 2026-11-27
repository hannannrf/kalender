# S14: UI polish and dark mode

| Field | Value |
|---|---|
| Slice | S14 |
| Requirements | No new FR. Presentation of FR-06 and FR-11; C-05 phone-first; ui-direction.md (D-24) rules |
| Plan version used | v14 |
| Lead | Abdul Hannan Rauf |
| Mode | HITL: a visual change checked by a human on a phone-size screen, in light and dark |
| Agent | Claude Code (Opus 5.5) |
| Branch | `slice/S14-polish-dark-mode` |
| Date | 28 Nov 2026 |

## 1. Select

S13 is accepted and S12 is cut. Abdul Hannan Rauf found the UI "too basic" and chose option B ("polish") from three mock-ups, plus dark mode (28 Nov 2026). The slice changes only the PWA's presentation. It adds no feature, business rule, data, dependency or server change.

## 2. Context loaded

- `docs/design/ui-direction.md` (D-24):
  - the Chat colour is the one idea;
  - Uncertain is never shown by colour alone;
  - respect `prefers-reduced-motion`;
  - every text pair has at least 4.5:1 contrast.
- `web/src/styles/tokens.css`: every colour is a token, and no component uses a raw hex value, so dark mode can be a token swap.
- Gate 5 screenshots (`evidence/slices/S13/`): the screens are mostly empty grey while they load. Production takes 5 to 10 seconds per request.
- AGENTS.md section 2: CSS Modules and tokens only, no UI kit, no new package.

## 3. Criteria and tests (to agree before coding, Gate 1)

| ID | Criterion | Check |
|---|---|---|
| S14-1 | The Events day headers Aaj, Kal and Parson also show the date (for example "Kal" with "Sat 28 Nov"). Other days keep their full date. | manual, screenshot |
| S14-2 | Every Event card and Inbox group shows its Chat colour as a dot next to the Chat name, as well as the bar. Manual Events use the Manual grey. | manual, screenshot |
| S14-3 | While the Inbox, Events or Chats list loads, grey placeholder cards show where the cards will be. Screen readers still hear "Loading …". | manual, screenshot |
| S14-4 | After Confirm, the Events list shows a short "<title> confirmed" notice. After Dismiss, the Inbox shows "<title> dismissed". The notice is announced to screen readers and disappears by itself. There is no Undo. | manual, screenshot |
| S14-5 | The review screen shows the Source Message as a chat bubble, with the sender and time above it, under the Chat band. | manual, screenshot |
| S14-6 | Dark mode: every screen has a dark version with the same tokens, and every text and background pair keeps at least 4.5:1 contrast. Date and time inputs and the browser bar follow the mode. The Uncertain mark keeps its icon and the words "Check this". | manual in light and dark, screenshots; contrast values listed in section 6 |
| S14-7 | No regression: `npm run lint`, the web build and the full server test suite pass in CI. No raw hex value is added outside `tokens.css`. | CI, grep |
| S14-8 | Motion (the notice and the placeholder shimmer) stops under `prefers-reduced-motion`. | manual |

## 4. HITL or AFK

HITL: a person must look at every screen in light and dark on a phone-size screen. Decisions for the human before coding are recorded below.

### Gate 1 decision (28 Nov 2026)

Abdul Hannan Rauf answered through the agent's question form:
- dark mode: "Follow phone". Kalender follows the phone's light or dark setting through `prefers-color-scheme`. There is no new setting and nothing is stored;
- review band: "Keep solid". The band stays in the solid Chat colour with white text, and only the Source Message changes to a bubble;
- criteria S14-1 to S14-8: "Agree, build it".

## 5. AI implementation

Claude Code made the change on branch `slice/S14-polish-dark-mode`. It changed only files in `web/`. No package was added, and nothing in `server/` changed.

| Criterion | Change |
|---|---|
| S14-1 | `format.ts` gets `dayHeaderDate()`. It returns the full date only when the header is Aaj, Kal or Parson. `EventsPage` shows it in a muted span next to the header. |
| S14-2 | `InboxPage` and `EventsPage` show a dot in the Chat colour before the Chat name. A Manual Event shows the Manual grey and the word "Manual". |
| S14-3 | New `Placeholder` component: grey cards with a gentle pulse, `role="status"` and a hidden "Loading …" label. It is used on Inbox, Events and Chats, and while the app checks the session at start-up. Before, the start-up screen was blank. |
| S14-4 | New `Notice` component. The review screen passes the notice through router state, and the notice is cleared from history at once, so Back or a reload does not show it again. It hides after 4 seconds and stays in a `role="status"` region. |
| S14-5 | The sender and time now sit above the Source Message. The message has a bubble shape: one small corner and a thin border. |
| S14-6 | `tokens.css` gets `color-scheme: light dark` and a `prefers-color-scheme: dark` block that swaps the neutral tokens. The new tokens are `--on-colour` (white text on Chat colours, the badge and danger fills), `--danger-fill` and `--placeholder`. The Chat palette, the badge and the Uncertain mark keep their light values in both modes. Fields inside the yellow Uncertain mark keep `color-scheme: light`, so the picker icon stays dark on yellow. `index.html` has two `theme-color` values, so the browser bar follows the mode. |
| S14-8 | The existing global `prefers-reduced-motion` rule turns off every animation and transition, which includes the new pulse and the notice rise. |

## 6. Checks

Local check on 28 Nov 2026: a throwaway `@test.kalender.app` account on the Neon dev branch, with the SE-3D Class and Project Team sample exports, in a 375 x 812 phone viewport, in light and dark.

| ID | Result | Evidence |
|---|---|---|
| S14-1 | Pass. "Kal Sun 29 Nov" and "Parson Mon 30 Nov". | `S14/03`, `S14/07` |
| S14-2 | Pass. Blue dot for SE-3D Class, orange dot for Project Team, on Inbox and Events. | `S14/01`, `S14/05`, `S14/07` |
| S14-3 | Pass. Placeholders show on Events and Chats while the dev database answers. | `S14/04`, `S14/08` |
| S14-4 | Pass. "Meeting confirmed" shows above the nav after Confirm and then hides. Earlier, "Proposal draft due dismissed" showed on the Inbox after Dismiss. | `S14/03` |
| S14-5 | Pass. | `S14/02`, `S14/06` |
| S14-6 | Pass on the screens checked: Inbox, Events, review, Settings and Chats. The date and time pickers follow dark mode. Inside the yellow mark the picker icon stays dark. The Uncertain mark keeps its icon and "Check this". | `S14/05` to `S14/10` |
| S14-7 | Local: `npm run lint` clean, `tsc` clean, `npm run build -w web` passes. A grep finds no hex value outside `tokens.css`. CI result: see section 7. | CI |
| S14-8 | Checked in code only: the global rule is `animation: none !important; transition: none !important` under `prefers-reduced-motion: reduce`. The in-app browser cannot emulate reduced motion, so the motion was not watched turning off. | `web/src/styles/global.css` |

Contrast in dark mode, computed from the token values with the WCAG formula:

| Pair | Ratio |
|---|---|
| `--text` on `--ground` / `--card` / `--surface` | 15.7 / 14.0 / 11.6 |
| `--muted` on `--ground` / `--card` / `--surface` | 8.2 / 7.3 / 6.0 |
| `--on-primary` on `--primary` (buttons, notice) | 15.7 |
| `--check-ink` on `--check-bg` | 11.3 |
| `--danger` on `--danger-bg` / `--card` / `--ground` | 6.9 / 7.2 / 8.2 |
| `--on-colour` on each Chat colour | 4.9 to 6.2 |
| `--on-colour` on `--danger-fill` | 6.6 |
| Uncertain mark text on its yellow | 10.9 |

The Chat colour bars and dots on the dark card are 2.5:1 to 3.3:1. They are decoration: the Chat name is always written next to them, so no meaning depends on the colour alone.

Not checked: a real phone (only the in-app browser at phone size), reduced motion in a browser, and the Add Event and Edit Event forms in dark mode.

## 7. Human decision

**Accept**, Abdul Hannan Rauf, 28 Nov 2026 ("Accept, merge and tag"). Reason: S14-1 to S14-6 pass on the screens checked, CI is green on PR #15 (S14-7), and the reduced-motion rule is in place (S14-8). Accepted with these known limits:
- reduced motion was checked in code, not watched in a browser;
- the screens were checked in the in-app browser at phone size, not on a real phone;
- the Add Event and Edit Event forms were not looked at in dark mode.

## 8. Integrate

PR #15 merged into `main` with a merge commit, tagged `S14-accepted`; CI on `main` is Gate 4. The change is in `web/` only: two new components (`Placeholder`, `Notice`), token changes in `tokens.css`, and small page edits. No migration, no new dependency, no server change and no new Vercel variable.

## 9. Context updated

`plan.md` v15 (copy in `docs/plan-history/plan-v15.md`): S14 added as Accepted. Row 17 added to `evidence/workflow-evidence-log.md`.
