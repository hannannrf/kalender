-- Owner: chats (architecture section 5.2). FR-02, BR-02, BR-15. Holds no message text (NFR-01, BR-05).
-- user_id has no foreign key: modules never reach into identity's tables; account deletion calls chats.deleteAllForUser (S09).
create table approved_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,                     -- the name the User confirmed
  name_key text not null,                 -- normalised name from the file, compared on update (R2-4)
  colour smallint not null check (colour between 1 and 8),            -- Chat colour (G-02)
  look_back_days smallint not null check (look_back_days in (1, 3, 7)),
  date_order text not null check (date_order in ('DMY', 'MDY')),      -- reused on every update (R2-6)
  approved_at timestamptz not null,       -- Approval Time
  start_point timestamptz not null,       -- Approval Time minus Look-back, truncated to the minute (R2-5)
  read_up_to timestamptz,                 -- Read-up-to Point; null until a message is read
  boundary jsonb not null default '{}',   -- SHA-256 fingerprint -> count, for the Read-up-to minute only
  last_upload_at timestamptz not null,
  revoked_at timestamptz                  -- Revoke keeps the row without text (R2-15)
);

create index approved_chats_user_id_idx on approved_chats (user_id);
-- No two active Chats of one User share a name (Q-14).
create unique index approved_chats_active_name_idx on approved_chats (user_id, name_key) where revoked_at is null;
