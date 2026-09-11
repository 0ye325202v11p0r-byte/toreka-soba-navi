-- トレカ相場ナビ — Supabase schema
-- Run this once in the Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

-- ============ cards ============
create table if not exists public.cards (
  id text primary key,
  name text not null,
  rarity text not null,
  set_name text,
  card_number text,
  source_url text,
  current_price numeric,
  avg30 numeric,
  avg90 numeric,
  pct_vs_avg30 numeric,
  pct_vs_avg90 numeric,
  low30 numeric,
  change_amt30 numeric,
  judgment text check (judgment is null or judgment in ('割安', '適正', '割高')),
  trend_direction text check (trend_direction is null or trend_direction in ('rising', 'declining', 'flat')),
  data_quality text check (data_quality is null or data_quality in ('real', 'partial', 'flat')),
  history_is_estimated boolean default true,
  ai_verdict text check (ai_verdict is null or ai_verdict in ('割安', '適正', '割高')),
  ai_verdict_text text,
  ai_verdict_at date,
  source_note text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- judgment/trend_direction/data_quality/ai_verdict are enum-like in the app
-- (src/lib/types.ts's Judgment/DataQuality unions) but were left as plain
-- `text` with no DB-level constraint — unlike transactions.type below,
-- which does have one. Added these CHECK constraints during a self-review
-- (2026-09-12) after hardening the app-side handling of unexpected
-- data_quality values (isAutoTracked() etc.) made the DB-level gap obvious
-- by contrast. NOTE: this file only takes effect on a fresh `create table`;
-- the already-created production table needs a separate `alter table ...
-- add constraint` to pick these up (not run against production here — see
-- migration/retrofit_check_constraints.sql, prepared but NOT executed).
create index if not exists cards_set_name_idx on public.cards (set_name);
create index if not exists cards_updated_at_idx on public.cards (updated_at);

alter table public.cards enable row level security;

create policy "cards are publicly readable"
  on public.cards for select
  using (true);

-- No insert/update/delete policy is defined for anon/authenticated roles, so
-- RLS denies all writes from the browser by default. The migration script
-- and the Phase 2 cron job use the service_role key, which bypasses RLS
-- entirely (this is a Postgres/Supabase guarantee, not something a policy
-- needs to grant) — do not add a "service_role" policy here, it would be
-- dead code and could misleadingly suggest writes are otherwise possible.

-- ============ price_snapshots ============
-- normalized, append-only time series (replaces the fixed 90-length array)
create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards(id) on delete cascade,
  snapshot_date date not null,
  price numeric not null,
  created_at timestamptz default now(),
  unique (card_id, snapshot_date)
);

create index if not exists price_snapshots_card_id_date_idx
  on public.price_snapshots (card_id, snapshot_date);

alter table public.price_snapshots enable row level security;

create policy "price snapshots are publicly readable"
  on public.price_snapshots for select
  using (true);

-- same reasoning as public.cards above: no write policy for anon/authenticated
-- means the browser can never write here; the service_role key bypasses RLS.

-- ============ profiles ============
-- Not read or written anywhere in src/ as of this self-review (2026-09-12)
-- — the trigger below populates it on signup, but nothing displays or
-- edits display_name yet. Left in place rather than dropped: removing a
-- table + trigger is a production DB change this review doesn't make
-- unilaterally, and it may still be wanted for a future profile/display-
-- name feature. Flagging here so it isn't mistaken for something the app
-- currently depends on.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ transactions ============
-- per-user buy/sell ledger — this is the source of truth for holdings AND for
-- 収支 (realized/unrealized P&L). Current holdings and cost basis are derived
-- from this table (FIFO), not stored separately, so nothing is lost when a
-- card is sold — the transaction stays in history for P&L reporting.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  type text not null check (type in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  price_per_unit numeric not null check (price_per_unit >= 0),
  transaction_date date not null default current_date,
  note text,
  created_at timestamptz default now()
);

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_user_card_idx on public.transactions (user_id, card_id, transaction_date);

alter table public.transactions enable row level security;

create policy "users can view their own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "users can insert their own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "users can update their own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "users can delete their own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- ============ watchlist_items ============
create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  -- alert_rule example: {"type": "pct_vs_avg30", "op": "lte", "value": -15}
  alert_rule jsonb not null default '{}'::jsonb,
  last_triggered_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists watchlist_items_user_id_idx on public.watchlist_items (user_id);

alter table public.watchlist_items enable row level security;

create policy "users can view their own watchlist"
  on public.watchlist_items for select
  using (auth.uid() = user_id);

create policy "users can insert into their own watchlist"
  on public.watchlist_items for insert
  with check (auth.uid() = user_id);

create policy "users can update their own watchlist"
  on public.watchlist_items for update
  using (auth.uid() = user_id);

create policy "users can delete their own watchlist items"
  on public.watchlist_items for delete
  using (auth.uid() = user_id);

-- ============ subscriptions ============
-- synced from Stripe webhooks (Phase 3)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text, -- 'active' | 'trialing' | 'past_due' | 'canceled' | ...
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

create policy "users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- no write policy for anon/authenticated: only the Stripe webhook handler
-- (Phase 3), using the service_role key, may write here. service_role
-- bypasses RLS automatically — no policy needed or added for it.

-- ============ sync_runs ============
-- Phase 2 failure detection: one row per cron execution of
-- /api/cron/refresh-prices, so a silently-broken scraper (site layout
-- change, IP block, etc.) shows up as a fact in the database instead of
-- disappearing into a log nobody reads.
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_count integer not null default 0,
  success_count integer not null default 0,
  fail_count integer not null default 0,
  error_sample text
);

alter table public.sync_runs enable row level security;

create policy "authenticated users can view sync runs"
  on public.sync_runs for select
  using (auth.role() = 'authenticated');

-- no write policy for anon/authenticated: only the cron job (service_role)
-- writes here.

-- ============ grants ============
-- RLS policies decide which ROWS a role may see/touch, but Postgres also
-- requires a plain table-level GRANT before RLS is even evaluated — some
-- Supabase projects don't pre-configure this for tables created via the SQL
-- Editor, so it's granted explicitly here rather than assumed.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.cards, public.price_snapshots to anon, authenticated;
grant select, insert, update, delete on public.cards, public.price_snapshots to service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.transactions to service_role;

grant select, insert, update, delete on public.watchlist_items to authenticated;
grant select, insert, update, delete on public.watchlist_items to service_role;

grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

grant select on public.sync_runs to authenticated;
grant select, insert, update, delete on public.sync_runs to service_role;
