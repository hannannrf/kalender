# ADR-001: Architecture style: PWA client + modular monolith API

**Status:** Accepted

## Context

The product is built by a three-student team within one semester (C-01), only on free tools and tiers (C-03), and must be phone-first (C-04). The PRD has 13 FRs that share one User's data: Chats, Detected and Confirmed Events, Reminders and Calendar copies. Several rules cut across features. Revoke deletes a Chat's Detected Events (BR-06). Confirming an Event schedules a Reminder and updates the Linked Calendar (MF-03). Deleting the account removes everything (AC-13.3). Detection must be testable on its own (NFR-05), and privacy rules must have a clear owner (NFR-01, BR-05).

The architecture therefore needs clear module boundaries the team and an AI coding agent can respect, without the operational cost of a distributed system.

**Drivers:** C-01, C-03, C-04, NFR-01, NFR-05, BR-05, BR-06, BR-11, OQ-02.

## Alternatives considered

| Alternative | For | Against |
|---|---|---|
| A. Microservices (ingestion, detection, reminders and calendar as separate services) | Strong isolation; services scale on their own | Needs several deployments and network calls between services, plus distributed failures. Far beyond a 3-person semester and free tiers, and the cross-module rules would need distributed transactions. |
| B. Layered monolith (controllers → services → repositories, organised by technical layer) | Familiar and quick to start | Feature rules end up spread across layers, nobody owns privacy or retention, and an agent can call any repository from anywhere. |
| C. **Modular monolith**: one deployable API split into feature modules with public interfaces and private data | One codebase and one deployment. Clear owners for each rule, and boundaries that tests and the AI agent can enforce. | Boundaries are only by convention plus lint rules, not physical separation, so discipline is needed. |
| D. Client-only app (all parsing, detection and reminders on the phone, no server) | Maximum privacy, since message text never leaves the phone | Reminders and calendar updates must run while the app is closed (FR-09, BR-10). Web apps cannot schedule notifications offline reliably, and an iPhone cannot run background jobs for a web app. |
| E. Native app (Expo/React Native or Flutter) instead of a PWA | Most reliable notifications; native share sheet on both platforms | Needs app builds and installs, the team's stack is React plus Node, and the team chose a PWA (decision with the team, 10 Nov 2026). |

## Decision

1. **Client:** a Progressive Web App (React + Vite + TypeScript) that can be installed on the phone. On Android it registers as a share target, so a Chat Export can be shared straight from WhatsApp. On iPhone, the User picks the file instead.
2. **Server:** a **modular monolith** (`server/`, Node.js + Express + TypeScript) with these modules: `identity`, `chats`, `ingestion`, `detection`, `events`, `reminders`, `calendar-sync` and `jobs`, plus a small `shared` kernel. Each module exposes one public interface and owns its tables (ADR-005).
3. Modules call each other only through public interfaces. Follow-up effects of an Event change go through the transactional outbox (ADR-002), so each module stays owner of its own data.
4. One repository and one deployment for the API; the PWA is served from the same project.

## Rationale

- One deployment and one database fit C-01 and C-03. The team already builds React/Express/Postgres apps.
- Module ownership gives each PRD rule exactly one home: retention in `events`, read-once in `chats` with `ingestion`, and timing in `reminders`. That makes the rules testable and explainable in the demo.
- Detection as its own pure module lets NFR-05 be run as a normal automated test (ADR-004).
- A PWA works on Android and iPhone from one codebase, with no store fees and no installs to test.

## Trade-offs / consequences

- Boundaries must be enforced by convention, lint rules (no imports from another module's internals) and review. AGENTS.md states them for the AI agent.
- Web push on iPhone works only after the User adds the PWA to the Home Screen (iOS 16.4 or later). Otherwise Reminders are shown inside the app (FR-09, C-05), which is weaker than a native app. Accepted, and noted in OQ-02.
- On iPhone, the PWA cannot appear in the WhatsApp share sheet; the User saves the export to Files and picks it. NFR-04 (5-minute usability) must be checked on both phones.
- TypeScript is used on both sides so module interfaces are explicit and checked.
- If the product outgrows one process, modules can be split out later without redesigning boundaries.

## Revision: context v1.1 (after AI-agent validation)

- **Composition root:** a composition root (`server/src/app.ts`, `bootstrap.ts`) is named explicitly. It is not a module, may import every module's `index.ts` only for wiring, and holds no business logic (architecture.md §5.2, Q-1, Q-2).
- **Deployable naming:** the server deployable is `server/`, not `api/`, because Vercel turns every file under `api/` into a function. The only function is `api/index.ts` (Q-12).
