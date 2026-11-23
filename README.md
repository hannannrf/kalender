# Kalender

Kalender turns the WhatsApp Chat Exports a student chooses to upload into reviewed Events with one Reminder each, and can copy confirmed Events to Google Calendar. It reads English and Roman Urdu ("kal shaam 5 baje meeting hai") with published rules, and it never guesses silently: every uncertain detail is shown for the User to check before confirming.

ISE1003 Introduction to Software Engineering, Deliverable 4. Client: Mahd Ahmed. Team: Abdul Hannan Rauf (25I-3053), Zain Amjad (25I-3042), Muhammad Areeb (25I-3056).

## Where things are

| Path | What |
|---|---|
| `plan.md` | Current plan: slice backlog, status, gates. History in `docs/plan-history/`. |
| `AGENTS.md` | Rules for AI coding agents (stack, boundaries, privacy, testing, Git workflow). |
| `docs/PRD.md`, `docs/architecture.md`, `docs/adr/` | Approved requirements and architecture. |
| `docs/decisions.md` | Decisions made during Deliverable 4. |
| `docs/design/ui-direction.md` | The approved "Chat colours" UI direction and tokens. |
| `evidence/` | AI-native process evidence: gap review, per-slice records, test runs, AI session exports. |
| `fixtures/` | Test data (sample exports, 80-message Detection Test Set). Never edited. |
| `web/` | React + Vite PWA. |
| `server/` | Express app, one folder per module under `server/src/modules/`. |
| `api/index.ts` | The single Vercel function; re-exports the Express app. |

## Run it locally

Needs Node.js 22 or newer.

```powershell
npm install
```

```powershell
npm run dev -w server
```

```powershell
npm run dev -w web
```

Open http://localhost:5173. The API runs on port 3001 and Vite forwards `/api` to it. Without a database, Settings shows "Database: Not set up yet". To connect one, copy `.env.example` to `.env.local` and set `DATABASE_URL`.

## Checks

```powershell
npm test
```

```powershell
npm run lint
```

```powershell
npm run typecheck
```

```powershell
npm run build
```

`npm run lint` also enforces the module boundary rules from AGENTS.md section 4. GitHub Actions runs all four on every pull request, with a Postgres 17 service container.

## Deployment

Vercel deploys `main` to production and each pull request to a preview. Environment variables are listed in `.env.example` and set in the Vercel project, never committed.
