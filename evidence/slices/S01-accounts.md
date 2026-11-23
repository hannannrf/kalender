# S01: Accounts (create account, sign in and out, own data only)

| Field | Value |
|---|---|
| Slice | S01 |
| Requirements | FR-01, BR-11; AC-01.1, AC-01.2 (identity part) |
| Plan version used | v01 |
| Lead | Muhammad Areeb (proposed, O-7); session directed by Abdul Hannan Rauf |
| Mode | HITL (personal data and sessions) |
| Agent | Claude Code (Opus 5.5) |
| Branch | `slice/S01-accounts` |
| Date | 23 Nov 2026 |

## 1. Select

Next Must slice in `plan.md`. Every later slice needs a signed-in User and `req.userId`.

## 2. Context loaded

PRD FR-01, BR-11, AC-01.1, AC-01.2, AC-02.5; architecture section 5.2 (`identity` owns `users` and `sessions`), section 6 (public identity router before `requireUser`, `AuthedRequest` in `shared`), section 8 (sessions kept 30 days); AGENTS.md sections 3 to 5 (module layout, modules never import `identity`, `userId` only from the session, never log personal data); ADR-005 (Postgres, own session auth).

## 3. Criteria and tests (agreed before coding, Gate 1)

| ID | Criterion | Test |
|---|---|---|
| S01-1 (AC-01.1) | A new person creates an account with email and password and is signed in at once | `identity.routes.test.ts` "AC-01.1 register signs the User in" |
| S01-2 (AC-01.1) | A returning User signs in with the same email (any letter case) and password | "AC-01.1 returning User signs in" |
| S01-3 | A wrong password or unknown email is refused with one generic message, so the response does not reveal which accounts exist on sign-in | "refuses a wrong password", "refuses an unknown email" |
| S01-4 | Creating a second account with the same email is refused with 409 | "refuses a duplicate email" |
| S01-5 | Signing out ends the session: the same cookie no longer works | "sign-out ends the session" |
| S01-6 (AC-01.2, BR-11) | Every `/api` route except health and the public identity routes needs a valid session; `req.userId` comes only from the session, so User A's cookie can never act as User B | "AC-01.2 two Users only ever see themselves", "refuses a missing or forged session" |
| S01-7 | Passwords are stored only as bcrypt hashes; session tokens are stored only as SHA-256 hashes; the cookie is HttpOnly, SameSite=Lax, Secure on Vercel, 30 days | "stores only hashes" plus code review |
| S01-8 | The PWA shows a sign-in screen when signed out, a create-account screen, field errors under the field, and a sign-out button in Settings | Manual check at 375 x 812, screenshots |

AC-02.5 ("a new account has zero Approved Chats") moves to S02, because the Approved Chats list arrives there.

### EP and BVA (domain validation, `identity/domain.test.ts`)

| Input | Class or boundary | Expected |
|---|---|---|
| Email | valid `mahd@example.com` | accepted, stored lower case and trimmed |
| Email | `  Mahd@Example.COM ` | accepted as `mahd@example.com` |
| Email | empty, no `@`, no domain dot, contains a space | refused: "Enter a valid email address." |
| Email | 254 characters (max) | accepted |
| Email | 255 characters | refused |
| Password | 7 characters | refused: "Use at least 8 characters." |
| Password | 8 characters (min) | accepted |
| Password | 72 bytes (bcrypt max) | accepted |
| Password | 73 bytes, or 37 two-byte characters (74 bytes) | refused: "Use at most 72 characters." |
| Either | not a string (missing, number) | refused |

## 4. HITL or AFK

HITL. The human reviews the criteria above, the security choices in section 5, and the screens before Accept.

## 5. AI implementation

Filled in after the run.

## 6. Checks

Filled in after the run.

## 7. Human decision

Pending.

## 8. Integrate

Pending.

## 9. Context updated

Pending.
