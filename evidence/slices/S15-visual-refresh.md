# S15: Visual refresh and a Light or Dark choice

| Field | Value |
|---|---|
| Slice | S15 |
| Requirements | No new FR. Presentation of FR-05, FR-06, FR-11 and Settings; C-05 phone-first; ui-direction.md (D-24) rules |
| Plan version used | v15 |
| Lead | Abdul Hannan Rauf |
| Mode | HITL: a visual change checked by a human on a phone-size screen, in light and dark |
| Agent | Claude Code (Opus 5.5) |
| Branch | `slice/S15-visual-refresh` |
| Date | 28 Nov 2026 |

## 1. Select

After S14 was merged, Abdul Hannan Rauf found the change too small to notice (28 Nov 2026): "you didnt add anything else visually except dark mode. also there should be an option in settings to choose bw light and dark mode. the changes we mentioned are not there. make the app visually more appealing." Production did have S14. Its changes were small: a date next to Kal, a small dot, and a notice. S15 makes the Chat colour idea (D-24) much more visible and adds a Light or Dark choice in Settings.

## 2. Context loaded

- `docs/design/ui-direction.md` (D-24):
  - the Chat colour is the one idea;
  - Uncertain is never shown by colour alone;
  - respect reduced motion;
  - every text pair has at least 4.5:1 contrast.
- `evidence/slices/S14-polish-dark-mode.md`: the dark tokens and the contrast table.
- AGENTS.md section 2: CSS Modules and tokens only, no UI kit, no new package. Section 7: no new personal data.

## 3. Criteria and checks

The user's message gave the scope. The agent wrote these criteria from it before coding. The user did not agree them one by one; the user's request is the Gate 1 decision.

| ID | Criterion | Check |
|---|---|---|
| S15-1 | Settings has an Appearance section with Phone, Light and Dark. Phone follows the phone's setting. Light and Dark override it, last after a reload, and change the browser bar colour. The choice is kept on this phone only (`localStorage`), never sent to the server. | manual, screenshots, `data-theme` and `theme-color` read in the browser |
| S15-2 | Events shows the soonest Event as a large "Next up" card on its Chat colour, with the day, the date, the time, the Chat's initials and the place. When the Event is less than a day away, it also says "in 5 hours" or "in 40 min". | manual, screenshot |
| S15-3 | The other Events show the time in its own column, with a bar in the Chat colour, on a card tinted with the Chat colour. | manual, screenshot |
| S15-4 | Inbox shows how many Events wait. Each Chat header shows the Chat's initials on its colour and a count. Cards are tinted with the Chat colour. | manual, screenshot |
| S15-5 | Review: the Chat band has the Chat's initials, and the message bubble is tinted with the Chat colour. Chats: each Approved Chat shows its initials. The open tab in the nav has a pill behind its icon. Empty screens have an icon. Add Event has a plus icon. | manual, screenshots |
| S15-6 | Every text pair stays at 4.5:1 or more in light and dark, including text on the tinted cards and white on the Chat colours. The Chat name is always written, so colour is never the only cue. | computed, section 6 |
| S15-7 | No regression: lint, typecheck, web build and server tests pass in CI. No raw hex is added outside `tokens.css`. No new package. | CI, grep |

## 4. HITL or AFK

HITL: the look must be judged by a person. The theme choice is the user's own request. Storing it in `localStorage` on the phone adds no personal data to the server (AGENTS.md section 7).

## 5. AI implementation

Claude Code made the change on `slice/S15-visual-refresh`. It changed only files in `web/`. No package was added, and nothing in `server/` changed.

- `web/src/theme.ts` (new): `savedTheme()` and `applyTheme()`. The choice sets `data-theme` on `<html>`, is saved under `kalender-theme`, and copies `--ground` into the `theme-color` meta tags. "Phone" removes the setting.
- `web/index.html`: a one-line script reads the saved choice before first paint, so a forced Light or Dark does not flash the other look.
- `tokens.css`: the dark values now apply for `[data-theme='dark']`, and for the phone's dark setting unless `[data-theme='light']` is set. The two blocks hold the same values. New tokens: `--tint` (9% light, 18% dark), `--shadow-card` and `--shadow-raised`.
- New `ChatAvatar` component: initials on the Chat colour, plus `chatStyle()`, which sets `--c` for the tinted cards. A code name such as "SE-3D Class" gives "SE", and "Project Team" gives "PT".
- `format.ts`: `untilText()` for the Next up card. It returns null for an All-day Event or one more than a day away.
- Pages:
  - Events has the Next up card and the time column;
  - Inbox has the count line, Chat headers with initials and count, and tinted cards;
  - the review screen has the band initials and a tinted bubble;
  - Chats shows initials;
  - Settings has the Appearance section;
  - Empty states have an icon;
  - the nav has the pill, and its background lets the page show through slightly blurred.
- The new press animation (scale 0.985) and the nav pill change are switched off by the existing reduced-motion rule.

## 6. Checks

Local check on 28 Nov 2026: the S14 throwaway `@test.kalender.app` account on the Neon dev branch, in a 375 x 812 phone viewport.

| ID | Result | Evidence |
|---|---|---|
| S15-1 | Pass. With the phone in light, Dark gave `data-theme="dark"`, `theme-color` `#121412` and dark screens. With the phone in dark, Light gave `data-theme="light"`, a `#f3f4f2` background and `theme-color` `#f3f4f2`. The choice lasted after a full reload. Phone was put back at the end. | `S15/03`, `S15/04`, `S15/01` |
| S15-2 | Pass: "Next up, Meeting, Kal, Sun 29 Nov, 3:00 pm, SE, SE-3D Class, Room 4". "in …" was not seen, because the Event was more than a day away. | `S15/01`, `S15/05` |
| S15-3 | Pass. | `S15/01`, `S15/05` |
| S15-4 | Pass: "1 Event to check", a PT header with count 1, and an orange tint. | `S15/02`, `S15/06` |
| S15-5 | Pass on the review screen, Chats, Settings and the nav. The empty-state icon was not seen, because the test account had Events. | `S15/07`, `S15/08`, `S15/03` |
| S15-7 | Local: lint and `tsc` clean; `npm run build -w web` passes. A grep finds no hex outside `tokens.css`. CI result: see section 7. | CI |

Contrast, computed with the WCAG formula from the token values (S15-6):

| Pair | Lowest ratio over the 8 Chat colours and Manual grey |
|---|---|
| `--text` on a tinted card, light | 15.4 |
| `--muted` on a tinted card, light | 5.5 |
| `--text` on a tinted card, dark | 11.6 |
| `--muted` on a tinted card, dark | 6.0 |
| White on a Chat colour (Next up card, initials, review band) | 4.9 |

The S14 values for all other pairs still hold, because no other token value changed.

Not checked:
- a real phone;
- reduced motion in a browser;
- the "in …" text on the Next up card;
- the empty-state icon;
- the Add Event and Edit Event forms in the new look.
