-- Owner: events (architecture section 5.2). FR-06, FR-11, BR-05, BR-16.
-- Holds no message text (BR-05): only Event details and the Source Chat name and colour, copied so they outlive a Revoke.
create table confirmed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id uuid,                           -- Source Chat; null for a Manual Event (S06)
  chat_name text,                         -- null means "Manual"
  chat_colour smallint check (chat_colour between 1 and 8),
  title text not null check (char_length(title) between 1 and 60),
  date date not null,
  time time,                              -- null means All-day
  place text check (char_length(place) <= 40),
  created_at timestamptz not null default now()
);

create index confirmed_events_user_id_idx on confirmed_events (user_id, date, time);
