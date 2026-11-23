# UI direction: "Chat colours" (approved 23 Nov 2026, D-24)

Kalender is a phone-first PWA for students who confirm meetings and deadlines found in their WhatsApp Chat Exports. The interface is a tool the User opens between classes: calm, fast to scan, with one strong idea.

**The one idea:** every Approved Chat has its own colour, and that colour follows its Events everywhere. A User sees at a glance that the blue card came from SE-3D Class and the orange one from the project team.

## Tokens (source of truth: `web/src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--ground` | #F3F4F2 | Page background |
| `--card` | #FFFFFF | Event cards, sheets |
| `--surface` | #E8EAE6 | Inputs, secondary buttons, chips |
| `--line` | #E2E4DF | Hairlines and dividers |
| `--text` | #17181A | Main text |
| `--muted` | #5D6158 | Secondary text (4.5:1 or better on ground and card) |
| `--primary` | #17181A | Primary button fill (white text) |
| `--badge` | #C2410C | Inbox count badge |
| `--uncertain-mark` | #FDE68A | Highlight behind an Uncertain value |
| `--uncertain-ink` | #3B2C00 | Text on the mark |
| `--check-bg` | #FFF9E0 | "Check this" zone |
| `--check-ink` | #5A4300 | Text in the zone |
| `--danger` | #B42318 | Revoke, Delete account |

Chat palette, assigned in approval order (architecture section 8): #2457D6, #C2410C, #C2255C, #0F766E, #7C3AED, #A16207, #0E7490, #4D7C0F. Manual Events: #6B6F76. Every palette colour gives white text at least 4.5:1.

Type: Bricolage Grotesque 800 for screen titles and day headers; DM Sans 400/500/700 for everything else. Body 16px, line height 1.5. Scale 13 / 14 / 16 / 20 / 24 / 32.

Shape: cards radius 16 with a 5px colour bar on the left; sheets radius 22; buttons and inputs radius 12; touch targets at least 44px; 8px spacing grid.

Icons: Tabler icons, stroke 1.75, pasted as inline SVG components in `web/src/components/icons.tsx`.

## Screens

- **Bottom navigation:** Inbox (with count badge), Events, Chats, Settings. Icon plus label.
- **Inbox:** Detected Events grouped by Source Chat, each card with the colour bar, the title, the date and time, and a "Check this" chip when any detail is Uncertain.
- **Review a Detected Event:** a band in the Chat's colour with the Chat name; the Source Message as a quoted bubble; "Kalender read it as" followed by a field card (Event, Date, Time, Place, Reminder). Each interpreted field shows a one-line reason ("kal means tomorrow"). An Uncertain field has the yellow mark, an icon and a check zone with two explicit choices ("Keep 5:00 pm" / "Use 5:00 am"). The primary button stays disabled with the text "Check the time to confirm" until every Uncertain field is resolved. Dismiss is a secondary button.
- **Events:** upcoming Confirmed Events under day headers Aaj, Kal, Parson, then weekday and date.
- **Chats:** Approved Chats with their colour, last upload time and an "Update" action; the guided upload screen shows the three WhatsApp steps (open the chat, Export chat, Without media).
- **Settings:** default Lead Time, Google Calendar link, push permission, delete account (danger zone, confirm dialog).

## Rules

- Uncertain is never shown by colour alone: mark plus icon plus the words "Check this".
- No WhatsApp green, logo or chat-bubble branding as identity.
- Respect `prefers-reduced-motion`; visible focus rings; every input has a label; password managers allowed.
- Errors sit under the field that caused them and say what to do ("This file is not a WhatsApp Chat Export. In WhatsApp choose Export chat, then Without media.").
- Empty states name the next action ("No Approved Chats yet. Upload your first Chat Export.").
