-- Owner: jobs (architecture section 5.2, ADR-002). Scheduled work and the transactional outbox.
-- user_id is nullable and has no foreign key (ADR-005); it lets work be cancelled per User (BR-10, account deletion).
create table jobs (
  id bigserial primary key,
  type text not null,
  payload jsonb not null default '{}',
  user_id uuid,
  dedupe_key text,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- One pending job per (type, dedupe_key): enqueueing again moves it (Q-10).
create unique index jobs_pending_dedupe_idx on jobs (type, dedupe_key) where status = 'pending' and dedupe_key is not null;
create index jobs_due_idx on jobs (run_at) where status = 'pending';

create table outbox (
  id bigserial primary key,
  type text not null,
  payload jsonb not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);

create index outbox_pending_idx on outbox (id) where dispatched_at is null;

-- One row per message and subscriber, so a subscriber never handles a message twice (Q-10).
create table outbox_deliveries (
  outbox_id bigint not null references outbox (id) on delete cascade,
  subscriber text not null,
  delivered_at timestamptz not null default now(),
  primary key (outbox_id, subscriber)
);
