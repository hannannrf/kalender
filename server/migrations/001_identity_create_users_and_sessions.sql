-- Owner: identity (architecture section 5.2). FR-01, BR-11.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,             -- stored trimmed and lower case
  password_hash text not null,            -- bcrypt; the password itself is never stored
  created_at timestamptz not null default now(),
  deletion_requested_at timestamptz       -- set first by deleteAccount (S09); blocks sign-in at once
);

create table sessions (
  token_hash text primary key,            -- SHA-256 of the cookie token; the token itself is never stored
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null         -- 30 days (architecture section 8)
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);
