-- トレカ相場ナビ — Supabase schema
-- Run this once in the Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

-- ============ app_settings ============
-- Emergency kill-switch storage, added 2026-09-12 alongside the yuyu-tei
-- daily-tracking cron — see src/lib/appSettings.ts for the full rationale
-- and the exact UPDATE statement used to flip it. Publicly readable
-- (anon+authenticated) so both server components and the cron route can
-- check it without needing the service_role key; write access is
-- intentionally left to the Supabase SQL Editor only (no anon/authenticated
-- write policy, no app-facing UI to change it) — this is meant to be
-- flipped in a hurry directly by whoever needs to, not through a feature
-- that itself might be down.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app settings are publicly readable"
  on public.app_settings for select
  using (true);

-- no write policy for anon/authenticated: only the Supabase SQL Editor
-- (as the table owner) or the service_role key may write here.

insert into public.app_settings (key, value)
values ('yuyutei_source_enabled', 'true'::jsonb)
on conflict (key) do nothing;

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
  -- snapshot_date is a UTC calendar date, not a JST one (raised by Codex,
  -- 2026-09-12, discussed but deliberately not changed — see
  -- COORDINATION.md for the full reasoning and future-migration
  -- conditions). Both crons that write this column (refresh-prices,
  -- refresh-yuyutei-prices — check-watchlist never writes
  -- price_snapshots) stamp it via `new Date().toISOString().slice(0, 10)`,
  -- i.e. UTC "today" at the moment they run. Since those two run at UTC
  -- 20:00/20:30 (JST 05:00/05:30 the NEXT calendar day per vercel.json),
  -- the date recorded
  -- here is systematically the JST calendar day BEFORE the one the cron
  -- actually ran on. This does not affect avg30/90 math — computeStats()
  -- only ever compares snapshot_date strings against each other, all under
  -- the same UTC convention, so the day-window logic stays internally
  -- consistent. It matters only if you query this column directly and
  -- assume it's a JST date (e.g. in the Supabase SQL Editor) — it isn't.
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
  -- Total fee/commission actually paid on this one transaction (buy or
  -- sell) — added 2026-09-13 so 含み損益/実現損益 reflects what really
  -- lands in the user's pocket, not just quantity*price_per_unit. Optional
  -- in the UI (defaults to 0, the same as every transaction recorded
  -- before this column existed); see src/lib/pnl.ts for how it folds into
  -- the FIFO calculation. `not null default 0` rather than nullable so
  -- computePnl() never has to branch on null — a real transaction with no
  -- fee IS a fee of exactly 0, not an unknown fee.
  fee numeric not null default 0 check (fee >= 0),
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

-- Owner-only (self-review, 2026-09-12) — this used to be
-- `auth.role() = 'authenticated'`, readable by ANY logged-in user. Combined
-- with open passwordless signup (no allowlist on who can create an
-- account), that meant literally anyone could read cron run history and
-- raw error_sample text (internal card ids, scraper failure details) via
-- the Supabase client directly — the app's own /admin/sync-status page
-- gate (src/lib/adminAuth.ts) only restricts the Next.js PAGE, not the
-- underlying table, and the anon/publishable key used by that client is
-- public by design. A page-level check alone is not real access control
-- when the row itself is still readable by anyone who bypasses the page.
-- Replace the email literal below with your own before running — RLS
-- policies can't read process.env, so this can't reference ADMIN_EMAIL
-- directly; keep the two in sync by hand. See
-- migration/retrofit_admin_only_sync_runs.sql for the ALTER needed on the
-- already-created production table (this schema.sql definition only
-- applies to a fresh `create table`).
--
-- lower(trim(...)) on BOTH sides (Codex independent review, 2026-09-13) —
-- src/lib/adminAuth.ts's isAdminUser() already trims and lowercases before
-- comparing, but this policy originally did a bare `=`. With the same
-- ADMIN_EMAIL value typed differently in two places (a capitalized email
-- as Supabase actually stored it vs. a lowercase literal pasted here, or a
-- stray trailing space in either), the app-side page gate could pass while
-- this DB-side policy silently returned zero rows — not a security leak
-- (the failure mode is MORE restrictive, denying the rightful owner, not
-- granting anyone else access), but a confusing self-lockout where
-- /admin/sync-status renders yet shows "no run history" even though rows
-- exist. Wrapping both sides the same way here makes the two checks apply
-- the identical normalization instead of relying on typing it consistently
-- by hand in two unrelated files.
--
-- drop-before-create (Codex, 2026-09-13) makes this block safely re-runnable
-- if you ever rotate the admin email — `create policy` alone errors with
-- "policy already exists" on a second run since Postgres has no
-- `create policy if not exists`.
drop policy if exists "only admin can view sync runs" on public.sync_runs;
create policy "only admin can view sync runs"
  on public.sync_runs for select
  using (lower(trim(auth.jwt() ->> 'email')) = lower(trim('REPLACE_WITH_YOUR_ADMIN_EMAIL')));

-- no write policy for anon/authenticated: only the cron job (service_role)
-- writes here.

-- ============ yuyutei_sync_runs ============
-- Same purpose as sync_runs above, but for
-- /api/cron/refresh-yuyutei-prices (added 2026-09-12) — a separate table
-- rather than adding rows to sync_runs, since that table's own comment
-- documents it as specifically "one row per cron execution of
-- /api/cron/refresh-prices"; reusing it for a second, structurally
-- different cron (which tracks sets fetched, not just cards) would need a
-- job-type column and stop being self-describing. NOT YET RUN against
-- production — see migration/README.md for the manual step required
-- before the new cron route can log to it.
create table if not exists public.yuyutei_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sets_total integer not null default 0,
  sets_fetched integer not null default 0,
  sets_failed integer not null default 0,
  total_count integer not null default 0,
  success_count integer not null default 0,
  fail_count integer not null default 0,
  not_found_count integer not null default 0,
  error_sample text
);

alter table public.yuyutei_sync_runs enable row level security;

-- Owner-only, same reasoning and same email literal as sync_runs' policy
-- above (self-review, 2026-09-12) — see that comment for why
-- `auth.role() = 'authenticated'` alone was not real access control, and
-- for why both sides are wrapped in lower(trim(...)) and the policy is
-- dropped before being recreated (Codex independent review, 2026-09-13).
-- Unlike sync_runs, this table has not been created in production yet, so
-- (as long as you create it via this schema.sql block, not a copy made
-- before this fix) no separate retrofit ALTER is needed here — just
-- replace the email literal before running.
drop policy if exists "only admin can view yuyutei sync runs" on public.yuyutei_sync_runs;
create policy "only admin can view yuyutei sync runs"
  on public.yuyutei_sync_runs for select
  using (lower(trim(auth.jwt() ->> 'email')) = lower(trim('REPLACE_WITH_YOUR_ADMIN_EMAIL')));

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

grant select on public.app_settings to anon, authenticated;
grant select, insert, update, delete on public.app_settings to service_role;

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

grant select on public.yuyutei_sync_runs to authenticated;
grant select, insert, update, delete on public.yuyutei_sync_runs to service_role;
