-- wasai-match: schema + RLS
-- Run this whole file in the Supabase SQL Editor for the wasai-match project.
-- Idempotent: safe to re-run after adding new sections below.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row, created by the signup server action
-- right after supabase.auth.signUp() succeeds (requires "Confirm email" OFF
-- in Supabase Auth settings, same reasoning as the sibling toreka-soba-navi
-- project: a magic-link / confirmation-email flow burns into the project's
-- shared 2-emails/hour Supabase send limit, which a public signup form can't
-- tolerate. This app uses email+password only, never magic links.)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('client', 'craftsman')),
  display_name text not null,
  avatar_url text,
  bio text,
  prefecture text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (true);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- craftsman_profiles: extra fields only relevant to role = 'craftsman'.
-- Kept as a separate 1:1 table (rather than nullable columns on profiles)
-- so client profiles never carry meaningless nulls for craftsman-only data.
-- ---------------------------------------------------------------------------
create table if not exists craftsman_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  grade text check (grade in ('1級', '2級', '3級', 'その他資格', '資格なし')),
  years_experience integer check (years_experience >= 0),
  specialties text[] not null default '{}',
  portfolio_urls text[] not null default '{}',
  is_accepting_orders boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table craftsman_profiles enable row level security;

drop policy if exists "craftsman_profiles_select_all" on craftsman_profiles;
create policy "craftsman_profiles_select_all" on craftsman_profiles for select using (true);

drop policy if exists "craftsman_profiles_insert_own" on craftsman_profiles;
create policy "craftsman_profiles_insert_own" on craftsman_profiles for insert with check (auth.uid() = profile_id);

drop policy if exists "craftsman_profiles_update_own" on craftsman_profiles;
create policy "craftsman_profiles_update_own" on craftsman_profiles for update using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- services: a craftsman's fixed-price listing (ココナラの「出品」に相当).
-- ---------------------------------------------------------------------------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  craftsman_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  garment_type text not null,
  price integer not null check (price >= 0),
  delivery_days integer not null check (delivery_days > 0),
  revision_count integer not null default 1 check (revision_count >= 0),
  status text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table services enable row level security;

drop policy if exists "services_select_published_or_own" on services;
create policy "services_select_published_or_own" on services for select
  using (status = 'published' or craftsman_id = auth.uid());

drop policy if exists "services_insert_own" on services;
create policy "services_insert_own" on services for insert with check (craftsman_id = auth.uid());

drop policy if exists "services_update_own" on services;
create policy "services_update_own" on services for update using (craftsman_id = auth.uid());

drop policy if exists "services_delete_own" on services;
create policy "services_delete_own" on services for delete using (craftsman_id = auth.uid());

-- ---------------------------------------------------------------------------
-- requests: a client's open call for quotes (ココナラの「見積り依頼」).
-- ---------------------------------------------------------------------------
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  garment_type text not null,
  budget_min integer check (budget_min >= 0),
  budget_max integer check (budget_max >= 0),
  deadline date,
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now()
);

alter table requests enable row level security;

drop policy if exists "requests_select_all" on requests;
create policy "requests_select_all" on requests for select using (true);

drop policy if exists "requests_insert_own" on requests;
create policy "requests_insert_own" on requests for insert with check (client_id = auth.uid());

drop policy if exists "requests_update_own" on requests;
create policy "requests_update_own" on requests for update using (client_id = auth.uid());

-- ---------------------------------------------------------------------------
-- proposals: a craftsman's quote against a request.
-- ---------------------------------------------------------------------------
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  craftsman_id uuid not null references profiles(id) on delete cascade,
  price integer not null check (price >= 0),
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (request_id, craftsman_id)
);

alter table proposals enable row level security;

drop policy if exists "proposals_select_participant" on proposals;
create policy "proposals_select_participant" on proposals for select
  using (
    craftsman_id = auth.uid()
    or request_id in (select id from requests where client_id = auth.uid())
  );

drop policy if exists "proposals_insert_own" on proposals;
create policy "proposals_insert_own" on proposals for insert with check (craftsman_id = auth.uid());

-- Both sides can transition status: the craftsman can withdraw their own
-- proposal, the request's owner can accept/decline it.
drop policy if exists "proposals_update_participant" on proposals;
create policy "proposals_update_participant" on proposals for update
  using (
    craftsman_id = auth.uid()
    or request_id in (select id from requests where client_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- orders: a confirmed job, created either from an accepted proposal or a
-- direct service purchase. No payment processing yet (see README) — status
-- only tracks work progress; price/payment arrangement happens off-platform
-- for this MVP.
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  craftsman_id uuid not null references profiles(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  proposal_id uuid references proposals(id) on delete set null,
  title text not null,
  price integer not null check (price >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'delivered', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table orders enable row level security;

drop policy if exists "orders_select_participant" on orders;
create policy "orders_select_participant" on orders for select
  using (client_id = auth.uid() or craftsman_id = auth.uid());

drop policy if exists "orders_insert_client" on orders;
create policy "orders_insert_client" on orders for insert with check (client_id = auth.uid());

drop policy if exists "orders_update_participant" on orders;
create policy "orders_update_participant" on orders for update
  using (client_id = auth.uid() or craftsman_id = auth.uid());

-- ---------------------------------------------------------------------------
-- messages: a simple per-order chat thread.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

drop policy if exists "messages_select_participant" on messages;
create policy "messages_select_participant" on messages for select
  using (order_id in (select id from orders where client_id = auth.uid() or craftsman_id = auth.uid()));

drop policy if exists "messages_insert_participant" on messages;
create policy "messages_insert_participant" on messages for insert
  with check (
    sender_id = auth.uid()
    and order_id in (select id from orders where client_id = auth.uid() or craftsman_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- reviews: one review per completed order, left by the client.
-- ---------------------------------------------------------------------------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  craftsman_id uuid not null references profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table reviews enable row level security;

drop policy if exists "reviews_select_all" on reviews;
create policy "reviews_select_all" on reviews for select using (true);

drop policy if exists "reviews_insert_own_completed_order" on reviews;
create policy "reviews_insert_own_completed_order" on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and order_id in (select id from orders where client_id = auth.uid() and status = 'completed')
  );

-- ---------------------------------------------------------------------------
-- Helpful indexes for the query patterns above.
-- ---------------------------------------------------------------------------
create index if not exists idx_services_craftsman on services(craftsman_id);
create index if not exists idx_services_status on services(status);
create index if not exists idx_requests_client on requests(client_id);
create index if not exists idx_requests_status on requests(status);
create index if not exists idx_proposals_request on proposals(request_id);
create index if not exists idx_proposals_craftsman on proposals(craftsman_id);
create index if not exists idx_orders_client on orders(client_id);
create index if not exists idx_orders_craftsman on orders(craftsman_id);
create index if not exists idx_messages_order on messages(order_id);
create index if not exists idx_reviews_craftsman on reviews(craftsman_id);
