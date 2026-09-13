-- NOT YET RUN. Prepared 2026-09-13 alongside the Web Push notification
-- feature for watchlist alerts (src/app/api/cron/check-watchlist/route.ts,
-- src/components/WatchlistClient.tsx). This is a NEW table (unlike
-- transactions.fee, which was an ALTER on an existing production table) —
-- run this whole block once in the Supabase SQL Editor to create it.
--
-- No external account or API key is required for this feature (unlike
-- Resend) — the VAPID key pair is generated locally; see
-- .env.local.example for how, and set NEXT_PUBLIC_VAPID_PUBLIC_KEY /
-- VAPID_PRIVATE_KEY in Vercel's environment variables after running this.
--
-- No production DB changes made by this session — this file is prepared
-- locally only, per this project's standing constraint.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "users can insert their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
