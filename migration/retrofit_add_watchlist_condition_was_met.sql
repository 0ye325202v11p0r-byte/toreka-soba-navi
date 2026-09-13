-- NOT YET RUN. Prepared 2026-09-13 alongside the Web Push notification
-- feature — schema.sql's `create table if not exists` only applies on
-- first creation, so the already-existing production `watchlist_items`
-- table needs this separate ALTER to pick up the new column (same
-- constraint noted in retrofit_add_transaction_fee.sql for a different
-- schema.sql-only-applies-once gap).
--
-- Safe for existing rows: `default false` backfills every already-existing
-- watchlist item as "not currently known to be met" — the honest state,
-- since no per-check history existed before this column did. Worst case,
-- the very first check-watchlist run after this migration treats an
-- already-long-triggered condition as "newly triggered" and sends one
-- (correct, if slightly late) push; every run after that behaves exactly
-- as intended.
--
-- No production DB changes made by this session — this file is prepared
-- locally only, per this project's standing constraint.

alter table public.watchlist_items
  add column if not exists condition_was_met boolean not null default false;
