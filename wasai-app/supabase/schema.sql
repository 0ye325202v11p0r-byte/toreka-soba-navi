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
-- reviews(craftsman_id) index removed here — Phase 7 below renames that
-- column to reviewee_id and (re)creates idx_reviews_reviewee instead. Left
-- out of this original block (rather than "create index ... craftsman_id"
-- immediately failing on a second full re-run of this file, once Phase 7
-- has already dropped that column) so the whole file stays safe to re-run
-- top to bottom any number of times.

-- ---------------------------------------------------------------------------
-- Phase 2（2026-09-15追加）: Stripe Connectによるエスクロー決済、資格級位限定の
-- 依頼、相場データ集計。ADD COLUMN IF NOT EXISTS で追記する形にしているのは、
-- このファイルを「差分だけ再実行すればよい」運用にしているため（README参照）
-- ——Phase 1が既に本番実行済みの環境でも、このセクションだけ安全に追いつける。
-- ---------------------------------------------------------------------------

-- 和裁士側のStripe Connect（Express）アカウント。プラットフォームが依頼者から
-- 直接課金し（destination chargeではない）、取引完了時にtransferで送金する
-- 「separate charges and transfers」方式を採るため、和裁士側の接続アカウントは
-- transfers capabilityだけ有効になればよく、charges_enabledは見ていない。
alter table craftsman_profiles add column if not exists stripe_account_id text;
alter table craftsman_profiles add column if not exists stripe_transfers_enabled boolean not null default false;

-- 依頼に資格級位の下限を指定できるように（1級限定の依頼など）。価格競争の
-- 回避策として、和裁士のgradeがこの水準を満たさない場合は提案できない
-- （enforcementはsubmitProposalアクション側、RLSではなくアプリ層）。
alter table requests add column if not exists min_grade text check (min_grade in ('1級', '2級', '3級', 'その他資格'));

-- orders.garment_type: services/requestsのどちらから生成された取引かに関わらず
-- 相場集計ページ（/market-rates）が単純なGROUP BYだけで済むよう非正規化。
alter table orders add column if not exists garment_type text;

-- 決済状態。ordersのstatus（作業の進捗）とは別軸——決済が完了するまで
-- 和裁士は作業を開始しない想定なので、statusの初期値も後述の通り変更する。
alter table orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'paid', 'transferred', 'refunded'));
alter table orders add column if not exists stripe_checkout_session_id text;
alter table orders add column if not exists stripe_payment_intent_id text;
alter table orders add column if not exists stripe_transfer_id text;
alter table orders add column if not exists platform_fee_amount integer check (platform_fee_amount >= 0);

-- statusに'pending_payment'を追加: 取引作成直後はここから始まり、Stripeの
-- webhookが決済完了を確認して初めて'in_progress'に進む（クライアントが直接
-- 'in_progress'へ更新できないよう、この遷移はservice roleのwebhookのみが行う
-- ——orders_update_participantポリシー自体は変えていないが、アプリ側の
-- updateOrderStatusアクションがpending_payment→in_progressを許可リストに
-- 含めていないため、通常のユーザー操作では発生しない）。
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending_payment', 'in_progress', 'delivered', 'completed', 'cancelled'));

create index if not exists idx_orders_garment_type on orders(garment_type);
create index if not exists idx_orders_payment_status on orders(payment_status);

-- ---------------------------------------------------------------------------
-- Phase 3（2026-09-15追加）: 相場データの公開集計（/market-rates）。
--
-- ordersテーブル自体は取引参加者しか読めないRLSのままにしたい（個別の取引額は
-- 依頼者・和裁士のプライバシー）——だが集計結果（種類別の件数・平均・最安・
-- 最高）は非会員にも公開して差別化コンテンツにしたい、という2つの要求を
-- 両立させるため、SECURITY DEFINERのRPC関数だけを公開する。関数はordersの
-- 生データを一切返さず、集計値のみを返す。件数3件未満のカテゴリは
-- 除外している（少数サンプルだと集計値から個別の取引価格が事実上特定できて
-- しまうため）。
-- ---------------------------------------------------------------------------
create or replace function public.market_rate_summary()
returns table (
  garment_type text,
  order_count bigint,
  avg_price numeric,
  min_price integer,
  max_price integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    garment_type,
    count(*) as order_count,
    avg(price) as avg_price,
    min(price) as min_price,
    max(price) as max_price
  from orders
  where status = 'completed' and garment_type is not null
  group by garment_type
  having count(*) >= 3
  order by garment_type;
$$;

grant execute on function public.market_rate_summary() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Phase 4（2026-09-15追加）: アプリ内通知。外部のメール/プッシュサービス
-- （Resend, Web Push等）のアカウント開設を待たずに、「新しい提案が来た」
-- 「メッセージが来た」「取引状態が変わった」を可視化するための最小構成。
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid());

-- insertだけ「受信者本人」ではなく「ログイン済みの誰でも」に開いている。
-- 通知は常に「相手の行動をきっかけに」作られる（提案が来たら依頼者に、
-- メッセージが来たらもう一方の参加者に、など）ため、user_id = auth.uid()
-- という制約にすると正当な通知作成まで防いでしまう。開けた場合の最悪ケースは
-- 悪意あるログイン済みユーザーがSupabase REST APIを直接叩いて他人宛に
-- 迷惑通知を挿入することだが、他人のデータの閲覧・改ざんには繋がらず
-- （読めるのは通知を受け取ったuser_id本人のみ）、このMVPで他にも許容している
-- リスク水準（例: 依頼投稿へのレート制限が無い等）と同程度と判断した。
drop policy if exists "notifications_insert_any_authenticated" on notifications;
create policy "notifications_insert_any_authenticated" on notifications for insert
  with check (auth.role() = 'authenticated');

create index if not exists idx_notifications_user_unread on notifications(user_id, read_at);

-- ---------------------------------------------------------------------------
-- Phase 5（2026-09-15追加）: 「納品済み」のまま依頼者が応答しないと、和裁士が
-- 永久に報酬を受け取れない欠陥への対応。delivered_atを記録し、日次cron
-- （/api/cron/auto-complete-orders）が一定日数放置されたdeliveredを自動的に
-- completedへ進める（migration/README的な手動有効化手順はREADME参照）。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists delivered_at timestamptz;

create index if not exists idx_orders_delivered_at on orders(status, delivered_at);

-- ---------------------------------------------------------------------------
-- Phase 6（2026-09-15追加）: 資格級位の運営確認（自己申告のままだと「1級限定」
-- 機能の信頼性が成り立たないという指摘への対応）。
-- ---------------------------------------------------------------------------
alter table craftsman_profiles add column if not exists certificate_url text;
alter table craftsman_profiles add column if not exists grade_verified boolean not null default false;
alter table craftsman_profiles add column if not exists grade_verified_at timestamptz;

-- grade_verifiedをtrueにできるのはservice role（管理者アクション）経由のみ。
-- craftsman_profiles_update_ownポリシーはprofile_id = auth.uid()であれば
-- どの列でも更新できてしまう（RLSは行単位でしか制御できず、列単位の制限は
-- ポリシーだけでは書けない）ため、本人が直接REST APIを叩いてgrade_verified
-- をtrueに書き換えることを防ぐにはトリガーが必要——でなければ「検証」機能が
-- 名ばかりになる。あわせて、grade・certificate_urlのいずれかが変わったら
-- 検証状態を自動的に未検証へ戻す（新しい申告は再確認が必要なため）。
create or replace function public.craftsman_profiles_guard_verification()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() <> 'service_role' then
      new.grade_verified := false;
      new.grade_verified_at := null;
    end if;
    return new;
  end if;

  if new.grade is distinct from old.grade or new.certificate_url is distinct from old.certificate_url then
    new.grade_verified := false;
    new.grade_verified_at := null;
  end if;

  if auth.role() <> 'service_role'
     and new.grade_verified is distinct from old.grade_verified
     and new.grade_verified = true then
    new.grade_verified := old.grade_verified;
    new.grade_verified_at := old.grade_verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_craftsman_profiles_guard_verification on craftsman_profiles;
create trigger trg_craftsman_profiles_guard_verification
  before insert or update on craftsman_profiles
  for each row
  execute function public.craftsman_profiles_guard_verification();

-- ---------------------------------------------------------------------------
-- Phase 7（2026-09-15追加）: レビューを依頼者→和裁士の一方向から双方向に。
-- 「問題のある依頼者（無応答・無理な要求等）の履歴が可視化されない」という
-- 指摘への対応——完了した取引の当事者なら、どちらからでも相手を評価できる
-- ようにする。craftsman_idをreviewee_id（評価される側、どちらの役割でも
-- 入りうる）に置き換え、「1取引につき1件まで」だったuniqueを
-- 「1取引につきreviewerごとに1件まで」（最大2件）に変更する。
-- ---------------------------------------------------------------------------
alter table reviews add column if not exists reviewee_id uuid references profiles(id) on delete cascade;
update reviews set reviewee_id = craftsman_id where reviewee_id is null;
alter table reviews alter column reviewee_id set not null;
alter table reviews drop column if exists craftsman_id;

alter table reviews drop constraint if exists reviews_order_id_key;
alter table reviews drop constraint if exists reviews_order_id_reviewer_id_key;
alter table reviews add constraint reviews_order_id_reviewer_id_key unique (order_id, reviewer_id);

drop policy if exists "reviews_insert_own_completed_order" on reviews;
drop policy if exists "reviews_insert_participant_completed_order" on reviews;
create policy "reviews_insert_participant_completed_order" on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = order_id
        and o.status = 'completed'
        and (o.client_id = auth.uid() or o.craftsman_id = auth.uid())
        and reviewee_id = case when o.client_id = auth.uid() then o.craftsman_id else o.client_id end
    )
  );

create index if not exists idx_reviews_reviewee on reviews(reviewee_id);

-- ---------------------------------------------------------------------------
-- Phase 13（2026-09-15追加）: 配送業者連携はしない（ヤマト・佐川・日本郵便
-- それぞれ法人契約が要り、この規模では現実的でない）が、「納品する」が
-- 和裁士の自己申告だけで、実際に発送した証拠が何も残らないという欠陥への
-- 最小限の対応として、配送方法・追跡番号を残せるだけの欄を追加する。
-- 既存のorders_update_participantポリシー（取引参加者なら誰でも更新可）で
-- 十分カバーされるため、RLSポリシーの追加は不要。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists shipping_method text;
alter table orders add column if not exists tracking_number text;

-- ---------------------------------------------------------------------------
-- Phase 14（2026-09-16追加）: 提案への簡易的な価格交渉。依頼者は「承諾/見送り」
-- の二択だけでなく、対抗価格を提示できるようにする。無限に往復させると
-- 合意形成もUIも複雑になるため、交渉は一往復（依頼者からの対抗提示→
-- 和裁士がその金額で承諾するか見送るか）までに制限する。
-- ---------------------------------------------------------------------------
alter table proposals add column if not exists countered_price integer;
alter table proposals drop constraint if exists proposals_countered_price_check;
alter table proposals add constraint proposals_countered_price_check
  check (countered_price is null or countered_price >= 0);
alter table proposals add column if not exists countered_message text;

alter table proposals drop constraint if exists proposals_status_check;
alter table proposals add constraint proposals_status_check
  check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'countered'));

-- ---------------------------------------------------------------------------
-- Phase 16（2026-09-16追加）: 和裁士が登録時に、得意分野ごとの目安料金を
-- 任意で入力できるようにする。「出品（services）」ほど作り込まなくても
-- 相場感が伝わるようにし、依頼者は自分の予算に合う和裁士を探しやすくなる
-- （/craftsmenで予算による絞り込みが可能になる）。
-- ---------------------------------------------------------------------------
create table if not exists craftsman_rates (
  id uuid primary key default gen_random_uuid(),
  craftsman_id uuid not null references profiles(id) on delete cascade,
  garment_type text not null,
  price integer not null check (price >= 0),
  created_at timestamptz not null default now(),
  unique (craftsman_id, garment_type)
);

alter table craftsman_rates enable row level security;

drop policy if exists "craftsman_rates_select_all" on craftsman_rates;
create policy "craftsman_rates_select_all" on craftsman_rates for select using (true);

drop policy if exists "craftsman_rates_write_own" on craftsman_rates;
create policy "craftsman_rates_write_own" on craftsman_rates for insert with check (craftsman_id = auth.uid());

drop policy if exists "craftsman_rates_update_own" on craftsman_rates;
create policy "craftsman_rates_update_own" on craftsman_rates for update using (craftsman_id = auth.uid());

drop policy if exists "craftsman_rates_delete_own" on craftsman_rates;
create policy "craftsman_rates_delete_own" on craftsman_rates for delete using (craftsman_id = auth.uid());

create index if not exists idx_craftsman_rates_craftsman on craftsman_rates(craftsman_id);
create index if not exists idx_craftsman_rates_garment_price on craftsman_rates(garment_type, price);

-- ---------------------------------------------------------------------------
-- Phase 18（2026-09-16追加）: 希望納期をordersに統一する。依頼掲示板
-- （requests.deadline）は元からあったが、出品（services）を直接購入する
-- 流れには依頼者が希望納期を伝える手段が一切なかった。成人式・卒業式など
-- 期日が決まっている依頼が多い和裁の性質上、これは実務上の抜けだった。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists desired_by date;

-- ---------------------------------------------------------------------------
-- Phase 19（2026-09-16追加）: 配送中の破損・紛失リスクへの対応。プラット
-- フォーム自身が保険を提供すると保険業法の免許が必要になりうるため、
-- 既存の配送業者の補償制度（宅急便/飛脚宅配便は30万円、ゆうパックは
-- セキュリティサービスで50万円まで等）に乗せる方針とし、想定価値を
-- 申告してもらった上で超過の可能性がある場合に注意喚起するに留める。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists declared_value integer;
alter table orders drop constraint if exists orders_declared_value_check;
alter table orders add constraint orders_declared_value_check
  check (declared_value is null or declared_value >= 0);

-- ---------------------------------------------------------------------------
-- Phase 20（2026-09-18追加）: 画像アップロード（Supabase Storage）。
-- avatar_url・portfolio_urls・certificate_urlはこれまで「外部URLを貼り
-- 付ける」方式だったが、一般の和裁士・依頼者には現実的でないため実際に
-- ファイルをアップロードできるようにする。資格証明書は氏名等の個人情報
-- を含みうるため非公開バケットとし、本人（自分の提出物のみ）と運営
-- （service_roleでRLSを迂回し署名付きURLを発行）のみが閲覧できる。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- 各バケットとも、オブジェクト名は "{auth.uid()}/..." で始める運用とし、
-- 先頭フォルダ名が自分のuidと一致する場合のみ書き込み・削除を許可する。
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "portfolio_public_read" on storage.objects;
create policy "portfolio_public_read" on storage.objects for select
  using (bucket_id = 'portfolio');

drop policy if exists "portfolio_owner_write" on storage.objects;
create policy "portfolio_owner_write" on storage.objects for insert
  with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "portfolio_owner_delete" on storage.objects;
create policy "portfolio_owner_delete" on storage.objects for delete
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

-- certificates: 非公開。本人のみ読み書き可（運営はservice_roleでRLSを
-- 迂回して署名付きURLを発行するため、専用ポリシーは不要）。
drop policy if exists "certificates_owner_read" on storage.objects;
create policy "certificates_owner_read" on storage.objects for select
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "certificates_owner_write" on storage.objects;
create policy "certificates_owner_write" on storage.objects for insert
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "certificates_owner_update" on storage.objects;
create policy "certificates_owner_update" on storage.objects for update
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Phase 24（2026-09-24追加）: 反物チェックシート。持ち込み生地の状態を
-- 作業開始前に写真＋チェック項目で記録しておくことで、「元から傷んでいた」
-- 「聞いていたのと量が違う」といった後からの水掛け論を防ぐ。記録後は
-- 編集不可にし、依頼者・和裁士どちらにも同じ内容が見える「共通の記録」と
-- して機能させる。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists fabric_check_completed_at timestamptz;
alter table orders add column if not exists fabric_check_damage boolean not null default false;
alter table orders add column if not exists fabric_check_shortage boolean not null default false;
alter table orders add column if not exists fabric_check_odor boolean not null default false;
alter table orders add column if not exists fabric_check_notes text;
alter table orders add column if not exists fabric_check_photo_urls text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('fabric-checks', 'fabric-checks', true)
on conflict (id) do nothing;

-- avatars/portfolioと同じ「{auth.uid()}/...」規約。記録するのは常に和裁士
-- （生地を受け取る側）だが、写真自体は当事者間の記録として公開URLで
-- 両者から見えるようにする（個人情報を含まないため portfolio と同じ扱い）。
drop policy if exists "fabric_checks_public_read" on storage.objects;
create policy "fabric_checks_public_read" on storage.objects for select
  using (bucket_id = 'fabric-checks');

drop policy if exists "fabric_checks_owner_write" on storage.objects;
create policy "fabric_checks_owner_write" on storage.objects for insert
  with check (bucket_id = 'fabric-checks' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Phase 25（2026-09-24追加）: 反物チェックの依頼者承認（裁断前ロック）。
-- Phase 24の反物チェックは和裁士が記録するだけで、依頼者がその内容に
-- 同意したかどうかを確認する場がなかった。裁断は後戻りできない工程なので、
-- 「依頼者が記録内容を確認・承認するまで、和裁士は納品に進めない」という
-- チェックポイントを追加する。あくまで納品操作をブロックするだけで、物理的に
-- 裁断を止められるわけではないが、後から「聞いてない」を防ぐ記録としては
-- これで十分機能する。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists fabric_check_approved_at timestamptz;

-- ---------------------------------------------------------------------------
-- Phase 26（2026-09-24追加）: 仕様確認（作業開始前の最終承認）。提案・依頼の
-- やり取りは価格と自由記述のメッセージだけなので、実際に何を作るかの細部
-- （寸法・仕上げ方・特殊な指定など）はチャットで詰めることが多く、「そんな
-- 仕様聞いてない」の火種になりやすい。取引開始後、和裁士が最終的な仕様を
-- 一度文章にまとめ、依頼者が明示的に承認するまで納品に進めないようにする。
-- 承認後の価格・納期変更（＝追加料金の請求）は決済のやり直しが絡む別問題
-- なので、ここでは扱わない（次フェーズ以降の課題として残す）。
-- ---------------------------------------------------------------------------
alter table orders add column if not exists spec_confirmation_text text;
alter table orders add column if not exists spec_confirmed_at timestamptz;
alter table orders add column if not exists spec_approved_at timestamptz;

-- ---------------------------------------------------------------------------
-- Phase 27（2026-09-24追加）: 同時受注上限（キャパシティ管理）。納期を
-- 「自動計算」しようとすると、1件あたりの所要日数を数式で決め打ちすること
-- になるが、その根拠になる実データが今は無い。数式を外して間違えるくらい
-- なら、確実な方——今の受注件数が設定した上限に達したら新規受注を
-- 自動的に止める——だけをやる。is_accepting_ordersが手動のオンオフ
-- スイッチなのに対し、これは件数に応じて自動で効く歯止め。
-- ---------------------------------------------------------------------------
alter table craftsman_profiles add column if not exists max_concurrent_orders integer;
alter table craftsman_profiles drop constraint if exists craftsman_profiles_max_concurrent_orders_check;
alter table craftsman_profiles add constraint craftsman_profiles_max_concurrent_orders_check
  check (max_concurrent_orders is null or max_concurrent_orders > 0);

-- ---------------------------------------------------------------------------
-- Phase 29（2026-09-27追加）: 取引（orders）・提案（proposals）の列単位の保護。
--
-- orders_update_participantポリシーは「当事者なら行のどの列でも書き換えられる」
-- ——RLSは行単位でしか絞れないため。アプリの画面・Server Actionを通さずに
-- 公開キー（anon key）＋自分のログインセッションでREST APIを直接叩けば、
-- 例えば次のことができてしまっていた:
--   - 自分で作った取引をpayment_status='paid'・status='delivered'・高額な
--     priceにして「完了」を押す → 運営のStripe残高（＝他の依頼者から預かって
--     いるお金）から自分のもう一つのアカウントへ送金させる
--   - 和裁士がdelivered_atを過去日付にして、依頼者の確認期間（7日）を待たずに
--     自動完了→送金させる
--   - 和裁士が反物チェック・仕様確認の「依頼者承認」を自分で埋める
-- 画面側の検証は迂回できるので、お金と承認に関わる列はDB側で守る。
-- service role（Webhook・cron・サーバー側の特権処理）とSQL Editor
-- （auth.role()がNULL）は対象外。
-- ---------------------------------------------------------------------------

-- 取引の作成はサーバー側（service role）でのみ行う。依頼者が直接INSERT
-- できると、status・payment_status・priceを好きな値で作れてしまうため。
-- アプリ側の作成処理（サービス購入・提案承諾）はadminClient()経由に変更済み。
drop policy if exists "orders_insert_client" on orders;

-- orders_guard_update（列の保護とステータス遷移の強制）は、Phase 30で
-- 納品後のキャンセル規則を変えた版に置き換えたため、ファイル末尾の
-- Phase 30にまとめて置いている。


-- proposals: 金額は提出後に当事者が書き換えられないようにする（依頼者が
-- 提案額を1円に書き換えてから承諾する、等を防ぐ）。交渉価格での合意時の
-- price更新はサーバー側（service role）で行う。交渉価格の提示は依頼主のみ。
-- proposals_guard_update（提案の列の保護）は、Phase 31で納期目安
-- （delivery_days）も守る版に置き換えたため、ファイル末尾のPhase 31に置いている。

-- ---------------------------------------------------------------------------
-- Phase 30（2026-09-29追加）: 納品後のキャンセル（全額返金）を止める。
--
-- それまでは、和裁士が納品した後でも依頼者が「キャンセル」を押すだけで
-- 代金が全額返金されていた（仕立てを終えて品物を送った和裁士が、代金を
-- 受け取れないまま品物も戻らない危険）。納品後は次の形にする。
--   - 依頼者: 完了にする／修正を依頼する（revision_limit回まで。出品の
--     「修正回数」、見積りからの取引は1回）／運営に相談する（disputed_at）
--   - 和裁士: 依頼者との話し合いの結果キャンセル（全額返金）に応じる
--   - 運営に相談中の取引は自動完了しない。運営が管理画面（/admin/orders）
--     から「和裁士に支払う（完了）」か「依頼者に返金する（キャンセル）」を
--     決める（service role）。
-- 一度でも納品された取引は、修正のため進行中に戻っても依頼者からは
-- キャンセルできない（戻してからキャンセル、の抜け道を塞ぐ）。
-- 本番のSupabaseには、この「Phase 30」の部分だけをSQL Editorで実行する
-- （何度実行しても同じ結果になる）。
-- ---------------------------------------------------------------------------

alter table orders add column if not exists revision_limit integer not null default 1
  check (revision_limit >= 0);
alter table orders add column if not exists revision_requests_used integer not null default 0;
alter table orders add column if not exists disputed_at timestamptz;

create or replace function public.orders_guard_update()
returns trigger
language plpgsql
as $$
declare
  actor uuid := auth.uid();
  is_client boolean := coalesce(actor = old.client_id, false);
  is_craftsman boolean := coalesce(actor = old.craftsman_id, false);
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- 作成後に当事者が変えてはいけない列（お金・当事者・取引内容）。
  if new.client_id is distinct from old.client_id
     or new.craftsman_id is distinct from old.craftsman_id
     or new.service_id is distinct from old.service_id
     or new.request_id is distinct from old.request_id
     or new.proposal_id is distinct from old.proposal_id
     or new.title is distinct from old.title
     or new.price is distinct from old.price
     or new.garment_type is distinct from old.garment_type
     or new.desired_by is distinct from old.desired_by
     or new.created_at is distinct from old.created_at
     or new.payment_status is distinct from old.payment_status
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_transfer_id is distinct from old.stripe_transfer_id
     or new.platform_fee_amount is distinct from old.platform_fee_amount
     or new.revision_limit is distinct from old.revision_limit then
    raise exception 'この項目は変更できません。' using errcode = '42501';
  end if;

  -- ステータス遷移。アプリのALLOWED_TRANSITIONS
  -- （src/app/orders/[id]/actions.ts）と同じ表をDB側でも強制する。
  -- pending_payment→in_progressはWebhook（service role）だけが行う。
  -- 納品後（一度でも納品された取引）は、依頼者の一方的なキャンセル
  -- （＝全額返金）はできない。依頼者にできるのは完了・修正の依頼
  -- （revision_limit回まで）・運営への相談（disputed_at）で、キャンセル
  -- （返金）は和裁士が応じた場合か、運営の判断（service role）による。
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending_payment' and new.status = 'cancelled' and is_client)
      or (old.status = 'in_progress' and new.status = 'delivered' and is_craftsman)
      or (old.status = 'in_progress' and new.status = 'cancelled' and is_craftsman)
      or (old.status = 'in_progress' and new.status = 'cancelled' and is_client and old.delivered_at is null)
      or (old.status = 'delivered' and new.status = 'completed' and is_client)
      or (old.status = 'delivered' and new.status = 'in_progress' and is_client
          and old.disputed_at is null and old.revision_requests_used < old.revision_limit)
      or (old.status = 'delivered' and new.status = 'cancelled' and is_craftsman)
    ) then
      raise exception 'この操作は現在の状態では行えません。' using errcode = '42501';
    end if;

    if new.status = 'delivered' then
      if old.fabric_check_completed_at is not null and old.fabric_check_approved_at is null then
        raise exception '依頼者が反物チェックの内容を承認するまで、納品操作はできません。' using errcode = '42501';
      end if;
      if old.spec_confirmed_at is not null and old.spec_approved_at is null then
        raise exception '依頼者が仕様の最終確認を承認するまで、納品操作はできません。' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 日時はクライアントから送られた値を信用せず、DBの現在時刻で決める
  -- （delivered_atを過去にずらして自動完了を早める、等を防ぐ）。
  new.delivered_at := case
    when new.status = 'delivered' and old.status is distinct from 'delivered' then now()
    else old.delivered_at end;
  new.completed_at := case
    when new.status = 'completed' and old.status is distinct from 'completed' then now()
    else old.completed_at end;
  -- 修正依頼の回数もクライアントの値は使わず、遷移から数える。
  new.revision_requests_used := case
    when old.status = 'delivered' and new.status = 'in_progress' then old.revision_requests_used + 1
    else old.revision_requests_used end;

  -- 運営への相談: 納品済みの取引で、依頼者が一度だけ（ステータスは変えない）。
  -- 相談中は自動完了の対象外になる（/api/cron/auto-complete-orders）。
  if new.disputed_at is distinct from old.disputed_at then
    if not is_client or old.disputed_at is not null
       or old.status <> 'delivered' or new.status <> 'delivered' then
      raise exception '運営への相談は、納品済みの取引で依頼者が一度だけ行えます。' using errcode = '42501';
    end if;
    new.disputed_at := now();
  end if;

  -- 配送情報は和裁士のみ。
  if (new.shipping_method is distinct from old.shipping_method
      or new.tracking_number is distinct from old.tracking_number
      or new.declared_value is distinct from old.declared_value)
     and not is_craftsman then
    raise exception '配送情報は和裁士のみ入力できます。' using errcode = '42501';
  end if;

  -- 反物チェックの記録: 和裁士が一度だけ。
  if new.fabric_check_completed_at is distinct from old.fabric_check_completed_at
     or new.fabric_check_damage is distinct from old.fabric_check_damage
     or new.fabric_check_shortage is distinct from old.fabric_check_shortage
     or new.fabric_check_odor is distinct from old.fabric_check_odor
     or new.fabric_check_notes is distinct from old.fabric_check_notes
     or new.fabric_check_photo_urls is distinct from old.fabric_check_photo_urls then
    if not is_craftsman or old.fabric_check_completed_at is not null then
      raise exception '反物チェックは和裁士が一度だけ記録できます。' using errcode = '42501';
    end if;
    new.fabric_check_completed_at := now();
  end if;

  -- 反物チェックの承認: 依頼者が、記録済みのものを一度だけ。
  if new.fabric_check_approved_at is distinct from old.fabric_check_approved_at then
    if not is_client or old.fabric_check_approved_at is not null or old.fabric_check_completed_at is null then
      raise exception '反物チェックの承認は、記録後に依頼者のみ行えます。' using errcode = '42501';
    end if;
    new.fabric_check_approved_at := now();
  end if;

  -- 仕様確認の記録: 和裁士が一度だけ。
  if new.spec_confirmation_text is distinct from old.spec_confirmation_text
     or new.spec_confirmed_at is distinct from old.spec_confirmed_at then
    if not is_craftsman or old.spec_confirmed_at is not null then
      raise exception '仕様確認は和裁士が一度だけ記録できます。' using errcode = '42501';
    end if;
    new.spec_confirmed_at := now();
  end if;

  -- 仕様確認の承認: 依頼者が、記録済みのものを一度だけ。
  if new.spec_approved_at is distinct from old.spec_approved_at then
    if not is_client or old.spec_approved_at is not null or old.spec_confirmed_at is null then
      raise exception '仕様確認の承認は、記録後に依頼者のみ行えます。' using errcode = '42501';
    end if;
    new.spec_approved_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_guard_update on orders;
create trigger trg_orders_guard_update
  before update on orders
  for each row
  execute function public.orders_guard_update();

-- ---------------------------------------------------------------------------
-- Phase 31（2026-09-30追加）: 提案（見積り）に納期目安（日数）を持たせる。
--
-- 出品には納期目安（delivery_days）があるが、提案には無く、見積りから
-- 決まった取引では、申込み前の最終確認（特定商取引法12条の6）に出す
-- 「役務の提供時期」を依頼の希望納期と提案文からしか示せなかった。
-- 提案時に和裁士が日数を入れ、最終確認・Stripeの支払い画面に表示する。
-- 提出後は価格と同じく当事者が書き換えられない（proposals_guard_update）。
-- 既存の提案はnullのまま（表示は従来どおり希望納期と提案文から）。
-- 本番のSupabaseには、この「Phase 31」の部分だけをSQL Editorで実行する。
-- ---------------------------------------------------------------------------

alter table proposals add column if not exists delivery_days integer
  check (delivery_days is null or delivery_days > 0);

create or replace function public.proposals_guard_update()
returns trigger
language plpgsql
as $$
declare
  is_request_owner boolean;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.price is distinct from old.price
     or new.request_id is distinct from old.request_id
     or new.craftsman_id is distinct from old.craftsman_id
     or new.message is distinct from old.message
     or new.delivery_days is distinct from old.delivery_days
     or new.created_at is distinct from old.created_at then
    raise exception 'この項目は変更できません。' using errcode = '42501';
  end if;

  select exists (
    select 1 from requests where id = old.request_id and client_id = auth.uid()
  ) into is_request_owner;

  if (new.countered_price is distinct from old.countered_price
      or new.countered_message is distinct from old.countered_message
      or (new.status = 'countered' and old.status is distinct from 'countered'))
     and not is_request_owner then
    raise exception '交渉価格の提示は依頼主のみ行えます。' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proposals_guard_update on proposals;
create trigger trg_proposals_guard_update
  before update on proposals
  for each row
  execute function public.proposals_guard_update();

-- ---------------------------------------------------------------------------
-- Phase 32（2026-09-30追加）: セキュリティの点検で見つかった3点の修正。
--
-- 1. 通知の偽造: notifications_insert_any_authenticatedにより、ログイン済み
--    なら誰でも、誰宛てにでも、好きな文面・リンクの通知を作れた（偽の
--    「運営からのお知らせ」で外部の偽サイトへ誘導、等）。insertはservice
--    role（アプリのnotify()）だけにし、リンクはサイト内（/で始まる）に限る。
-- 2. 和裁士の非公開情報: craftsman_profiles_select_allで、Stripeのアカウント
--    ID・振込可否・資格証明書の保存パスまで誰でも読めた。anon/authenticated
--    には公開してよい列だけSELECTを許可する（アプリはCRAFTSMAN_PUBLIC_COLUMNS
--    を指定し、本人・運営の画面はservice roleで読む）。
-- 3. 振込先の書き換え: 本人がstripe_account_id・stripe_transfers_enabledを
--    直接書き換えられた。service role（Stripeの登録処理・Webhook）だけにする。
-- 本番のSupabaseには、この「Phase 32」の部分だけをSQL Editorで実行する
-- （何度実行しても同じ結果になる）。
-- ---------------------------------------------------------------------------

drop policy if exists "notifications_insert_any_authenticated" on notifications;
alter table notifications drop constraint if exists notifications_link_internal;
alter table notifications add constraint notifications_link_internal
  check (link is null or (link like '/%' and link not like '//%')) not valid;

revoke select on craftsman_profiles from anon, authenticated;
grant select (profile_id, grade, years_experience, specialties, portfolio_urls,
  is_accepting_orders, max_concurrent_orders, grade_verified, grade_verified_at, updated_at)
  on craftsman_profiles to anon, authenticated;

create or replace function public.craftsman_profiles_guard_stripe()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stripe_account_id is not null or new.stripe_transfers_enabled then
      raise exception '振込先の情報は設定できません。' using errcode = '42501';
    end if;
  elsif new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_transfers_enabled is distinct from old.stripe_transfers_enabled then
    raise exception '振込先の情報は変更できません。' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_craftsman_profiles_guard_stripe on craftsman_profiles;
create trigger trg_craftsman_profiles_guard_stripe
  before insert or update on craftsman_profiles
  for each row
  execute function public.craftsman_profiles_guard_stripe();

-- ---------------------------------------------------------------------------
-- Phase 33（2026-10-01追加）: 試用の感想と、連絡先の見直しへの対応。
--
-- 1. 特定の和裁士への相談（指名依頼）: requests.directed_toが入った依頼は、
--    依頼者本人と指名された和裁士にしか見えず、提案できるのもその和裁士だけ。
--    あわせて、締め切った・成立した依頼にはDB側でも提案できないようにする。
-- 2. 依頼の寸法: 体の情報なので依頼本体（誰でも見られる）とは別の表に置き、
--    依頼者本人とログインした和裁士だけが読める（指名依頼なら指名された
--    和裁士だけ — requestsのRLSが副問い合わせにも効くため）。
-- 3. お気に入りの和裁士: 依頼者本人だけが見られる・増やせる・消せる。
-- 4. お問い合わせ: 運営者の個人のメールアドレスをサイトに載せる代わりに、
--    フォームで受け付けて保存する。読み書きはservice role（サイトの処理と
--    運営の管理画面）だけ。
-- 本番のSupabaseには、この「Phase 33」の部分だけをSQL Editorで実行する。
-- 新しいアプリはこれらの表を使うので、アプリの反映「前に」実行する
-- （今のアプリはこのSQLの後でも動く）。
-- ---------------------------------------------------------------------------

-- directed_toはprofilesへの外部キーにしない。requestsからprofilesへの参照が
-- 2本になると、アプリの `requests.select("*, profiles(*)")`（依頼者の表示）が
-- どちらの参照か決められずエラーになり、今のアプリの依頼ページが壊れるため。
-- 和裁士であることは下のrequests_insert_ownで確かめる。
alter table requests add column if not exists directed_to uuid;
alter table requests drop constraint if exists requests_directed_to_fkey;
create index if not exists idx_requests_directed_to on requests(directed_to);

drop policy if exists "requests_insert_own" on requests;
create policy "requests_insert_own" on requests for insert
  with check (
    client_id = auth.uid()
    and (
      directed_to is null
      or exists (select 1 from profiles p where p.id = directed_to and p.role = 'craftsman')
    )
  );

drop policy if exists "requests_select_all" on requests;
drop policy if exists "requests_select_visible" on requests;
create policy "requests_select_visible" on requests for select
  using (directed_to is null or client_id = auth.uid() or directed_to = auth.uid());

drop policy if exists "proposals_insert_own" on proposals;
create policy "proposals_insert_own" on proposals for insert
  with check (
    craftsman_id = auth.uid()
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.status = 'open'
        and (r.directed_to is null or r.directed_to = auth.uid())
    )
  );

create table if not exists request_measurements (
  request_id uuid primary key references requests(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  height_cm numeric(5,1) check (height_cm between 50 and 250),
  yuki_cm numeric(5,1) check (yuki_cm between 20 and 100),
  hip_cm numeric(5,1) check (hip_cm between 30 and 250),
  bust_cm numeric(5,1) check (bust_cm between 30 and 250),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  build text check (build in ('細身', '普通', 'ふくよか')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
alter table request_measurements enable row level security;

drop policy if exists "request_measurements_select" on request_measurements;
create policy "request_measurements_select" on request_measurements for select
  using (
    client_id = auth.uid()
    or (
      exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'craftsman')
      and exists (select 1 from requests r where r.id = request_id)
    )
  );

drop policy if exists "request_measurements_insert_own" on request_measurements;
create policy "request_measurements_insert_own" on request_measurements for insert
  with check (
    client_id = auth.uid()
    and exists (select 1 from requests r where r.id = request_id and r.client_id = auth.uid())
  );

drop policy if exists "request_measurements_update_own" on request_measurements;
create policy "request_measurements_update_own" on request_measurements for update
  using (client_id = auth.uid()) with check (client_id = auth.uid());

create table if not exists favorites (
  client_id uuid not null references profiles(id) on delete cascade,
  craftsman_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, craftsman_id)
);
alter table favorites enable row level security;

drop policy if exists "favorites_select_own" on favorites;
create policy "favorites_select_own" on favorites for select using (client_id = auth.uid());

drop policy if exists "favorites_insert_own" on favorites;
create policy "favorites_insert_own" on favorites for insert
  with check (
    client_id = auth.uid()
    and exists (select 1 from profiles p where p.id = craftsman_id and p.role = 'craftsman')
  );

drop policy if exists "favorites_delete_own" on favorites;
create policy "favorites_delete_own" on favorites for delete using (client_id = auth.uid());

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  category text not null check (category in (
    'サービスについて', '取引について', '特商法の表示事項の請求', '個人情報の開示等の請求', '不具合の報告', 'その他'
  )),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_inquiries_status on inquiries(status, created_at);
alter table inquiries enable row level security;
-- ポリシーは作らない（anon/authenticatedは一切読み書きできない。service roleだけ）。

-- ---------------------------------------------------------------------------
-- Phase 34（2026-10-02追加）: 和裁士のトップ画像・仕立てメニューの写真と、
-- 登録区分（依頼者／和裁士）の書き換え防止。
--
-- 1. profiles.cover_url（和裁士のページの上に大きく出す横長の画像）と
--    services.image_url（仕立てメニューの写真）。画像そのものは既存の
--    portfolio バケット（公開・本人のフォルダにだけ書ける）に置き、ここには
--    URLだけを持つ。http(s)のURL以外は入れられない。
-- 2. profiles.role は登録時にしか決めない（アプリが後から変える処理は無い）が、
--    本人がAPIを直接叩くと書き換えられた。依頼者が和裁士に化けると、登録時の
--    代金受領の同意（利用規約第5条）を経ずに提案・受注できてしまうため、
--    service role 以外からの変更を止める。
-- 本番のSupabaseには、この「Phase 34」の部分だけをSQL Editorで実行する。
-- 新しいアプリはこれらの列を使うので、アプリの反映「前に」実行する
-- （今のアプリはこのSQLの後でもそのまま動く）。
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists cover_url text;
alter table profiles drop constraint if exists profiles_cover_url_check;
alter table profiles add constraint profiles_cover_url_check
  check (cover_url is null or (cover_url ~ '^https?://' and char_length(cover_url) <= 1000));

alter table services add column if not exists image_url text;
alter table services drop constraint if exists services_image_url_check;
alter table services add constraint services_image_url_check
  check (image_url is null or (image_url ~ '^https?://' and char_length(image_url) <= 1000));

create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception '登録区分（依頼者・和裁士）は変更できません。' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_role on profiles;
create trigger trg_profiles_guard_role
  before update on profiles
  for each row
  execute function public.profiles_guard_role();
