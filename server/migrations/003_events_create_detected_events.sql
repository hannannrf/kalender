-- Owner: events (architecture section 5.2). FR-05, BR-05, BR-14, BR-17.
-- user_id and chat_id have no foreign keys: modules never reach into another module's tables (ADR-005).

-- A Source Message is kept only while it has a Detected Event (BR-05). A message with no Event is never stored.
create table source_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id uuid not null,
  sender text not null,
  text text not null,
  sent_at timestamptz not null
);

create index source_messages_user_id_idx on source_messages (user_id);

create table detected_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id uuid not null,                  -- Source Chat, for Possible Duplicate (BR-04)
  chat_name text not null,                -- copied so it outlives a Revoke (section 8)
  chat_colour smallint not null check (chat_colour between 1 and 8),
  source_message_id uuid not null references source_messages (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  date date,                              -- null means "Needs date" (GL-19)
  time time,                              -- null means All-day
  place text check (char_length(place) <= 40),
  uncertain text[] not null default '{}', -- subset of {date, time, event} (BR-21)
  rules text[] not null default '{}',     -- which U-rules fired, shown as the reason
  created_at timestamptz not null default now(),
  check (date is not null or time is null)
);

create index detected_events_user_id_idx on detected_events (user_id, date);
