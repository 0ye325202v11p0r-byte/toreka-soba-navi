-- NOT YET RUN. Prepared 2026-09-13 alongside the fee-aware P&L feature
-- (src/lib/pnl.ts, PortfolioClient.tsx) — schema.sql's `create table if not
-- exists` only applies on first creation, so the already-existing
-- production `transactions` table needs this separate ALTER to pick up the
-- new column (same constraint noted in retrofit_check_constraints.sql for
-- a different schema.sql-only-applies-once gap).
--
-- Safe for existing rows: `default 0` backfills every already-recorded
-- transaction with fee=0, which is the correct, honest value for
-- transactions recorded before this feature existed (no fee was ever
-- captured for them, and 0 is not a guess — it's simply what the app UI
-- allowed at the time).
--
-- No production DB changes made by this session — this file is prepared
-- locally only, per this project's standing constraint.

alter table public.transactions
  add column if not exists fee numeric not null default 0 check (fee >= 0);
