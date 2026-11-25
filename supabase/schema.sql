-- State singleton for Herbier. The server accesses this table with a Supabase secret key.
create table if not exists public.wishlist_state (
  id smallint primary key check (id = 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.wishlist_state enable row level security;

-- The public site never queries Supabase directly. Visitors and admins use the app API.
revoke all on table public.wishlist_state from anon, authenticated;
grant select, insert, update, delete on table public.wishlist_state to service_role;
