-- Owner: reminders (architecture section 5.1). FR-09 phone notifications, C-05, S10.
-- One row per browser push subscription. The endpoint is unique: a phone that signs in as another User moves its row.
-- Kept until the User turns push off or signs out on that phone, the push service answers 404 or 410, or the account is deleted.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);
