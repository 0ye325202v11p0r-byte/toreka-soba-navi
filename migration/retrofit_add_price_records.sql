-- NOT YET RUN. Prepared 2026-09-13 alongside the "史上最高値・最安値更新"
-- feature (src/lib/priceRecord.ts, src/lib/priceRecordUpdate.ts,
-- refresh-prices/route.ts, dashboard/page.tsx, check-price-records cron) —
-- schema.sql's `create table if not exists` only applies on first creation,
-- so the already-existing production `cards` table needs this separate
-- ALTER to pick up the four new columns (same constraint noted in
-- retrofit_add_transaction_fee.sql for a different schema.sql-only-applies-
-- once gap).
--
-- Deliberately no backfill UPDATE here: refresh-prices/route.ts's
-- resolvePriceRecord() lazily seeds all_time_high_price/all_time_low_price
-- from each card's full price_snapshots history the first time it processes
-- that card after this ALTER runs — see priceRecordUpdate.ts's comment for
-- why this is safe (currentPrice is already included in that seed scan, so
-- it can at best tie the freshly-seeded record on day one, never falsely
-- report a "new" record for every card at once). Until this ALTER is run,
-- the application code degrades gracefully: refresh-prices detects the
-- columns' absence (same select("*") + presence-check pattern already used
-- for watchlist_items.condition_was_met) and simply skips writing them, and
-- dashboard/page.tsx's select("*") read already returns `record_status:
-- undefined` -> coalesced to null for every card either way.
--
-- No production DB changes made by this session — this file is prepared
-- locally only, per this project's standing constraint.

alter table public.cards
  add column if not exists all_time_high_price numeric,
  add column if not exists all_time_low_price numeric,
  add column if not exists record_status text check (record_status is null or record_status in ('high', 'low')),
  add column if not exists record_status_date date;
