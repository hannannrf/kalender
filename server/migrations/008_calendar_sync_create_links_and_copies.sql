-- Owner: calendar-sync (architecture section 5.1). FR-08, FR-13 unlink, BR-09, BR-10, BR-18, S11.
-- One Linked Calendar per User. Tokens are AES-256-GCM ciphertext (ADR-005); the key lives only in TOKEN_ENCRYPTION_KEY.
-- Deleted on unlink and on account deletion (AC-13.2, AC-13.3).
create table calendar_links (
  user_id uuid primary key,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  status text not null default 'linked' check (status in ('linked', 'needs_reconnect')),
  linked_at timestamptz not null default now()
);

-- One row per Confirmed Event that has, or should have, a copy in Google. The Google event id is the Event id without dashes.
-- `details` (title, date, time, place) is what the copy should show, kept for retries; null means the copy should be removed.
-- Kept on unlink (R2-8), so relinking adds no second copy (BR-18). Deleted once the copy is removed, and on account deletion.
create table calendar_copies (
  event_id uuid primary key,
  user_id uuid not null,
  details jsonb,
  in_google boolean not null default false,
  status text not null default 'synced' check (status in ('synced', 'pending', 'failed')),
  first_failed_at timestamptz,
  retries integer not null default 0
);

create index calendar_copies_user_idx on calendar_copies (user_id);
