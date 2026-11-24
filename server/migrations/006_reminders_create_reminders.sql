-- Owner: reminders (architecture section 5.2). FR-09 (in-app), FR-10, BR-07, BR-08, BR-19, NFR-03.
-- No foreign keys to other modules' tables (ADR-005). Holds an Event copy (title, date, time) to show the Reminder; no message text.

create table reminder_settings (
  user_id uuid primary key,
  default_lead_minutes integer not null check (default_lead_minutes in (10, 30, 60, 1440))
);

-- One row per Confirmed Event. reminder_at and delivered_at are the NFR-03 evidence (R2-11).
create table reminders (
  event_id uuid primary key,
  user_id uuid not null,
  title text not null,
  date date not null,
  time time,                               -- null means All-day; 09:00 is used for the Reminder Time (BR-07)
  lead_minutes integer check (lead_minutes in (10, 30, 60, 1440)), -- null means the User's default (BR-19)
  enabled boolean not null default true,
  reminder_at timestamptz,
  status text not null check (status in ('scheduled', 'none', 'off', 'sent', 'late', 'missed')),
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index reminders_user_idx on reminders (user_id);
create index reminders_due_idx on reminders (reminder_at) where status = 'scheduled';

-- "Presented" for NFR-03 means this row exists (Q-23). Kept 7 days (architecture section 8).
create table in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid not null,
  title text not null,
  date date not null,
  time time,
  reminder_at timestamptz not null,
  kind text not null check (kind in ('due', 'late', 'missed')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index in_app_notifications_user_idx on in_app_notifications (user_id, created_at);
