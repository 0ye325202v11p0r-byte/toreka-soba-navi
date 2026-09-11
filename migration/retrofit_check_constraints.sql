-- NOT YET RUN. Prepared during a self-review (2026-09-12) after adding
-- CHECK constraints to supabase/schema.sql for cards.judgment/
-- trend_direction/data_quality/ai_verdict (previously plain `text` with no
-- DB-level validation, unlike transactions.type which already had one).
-- schema.sql only applies on a fresh `create table`, so the already-created
-- production table needs this separate `alter table ... add constraint`
-- to pick up the same guarantees.
--
-- This review deliberately did NOT run this against production (no
-- production DB changes without the user's explicit go-ahead — see
-- COORDINATION.md). Before running, it would be safest to first confirm no
-- existing row already violates these constraints (e.g. by asking Codex or
-- the user to run the SELECT checks below in the Supabase SQL editor); the
-- app-side code (migrate.mjs's dataQualityFromSourceNote,
-- priceStats.ts's computeStats, fix_verdict_wording.mjs) only ever writes
-- the values listed here, so no existing rows are expected to violate them,
-- but that has not been verified against the live table.
--
-- Optional pre-check (read-only, safe to run first):
--   select data_quality, count(*) from public.cards
--     where data_quality is not null and data_quality not in ('real','partial','flat')
--     group by data_quality;
--   select judgment, count(*) from public.cards
--     where judgment is not null and judgment not in ('割安','適正','割高')
--     group by judgment;
--   select trend_direction, count(*) from public.cards
--     where trend_direction is not null and trend_direction not in ('rising','declining','flat')
--     group by trend_direction;
--   select ai_verdict, count(*) from public.cards
--     where ai_verdict is not null and ai_verdict not in ('割安','適正','割高')
--     group by ai_verdict;
-- Each should return zero rows before applying the ALTER TABLE below.

alter table public.cards
  add constraint cards_judgment_check
    check (judgment is null or judgment in ('割安', '適正', '割高'));

alter table public.cards
  add constraint cards_trend_direction_check
    check (trend_direction is null or trend_direction in ('rising', 'declining', 'flat'));

alter table public.cards
  add constraint cards_data_quality_check
    check (data_quality is null or data_quality in ('real', 'partial', 'flat'));

alter table public.cards
  add constraint cards_ai_verdict_check
    check (ai_verdict is null or ai_verdict in ('割安', '適正', '割高'));
