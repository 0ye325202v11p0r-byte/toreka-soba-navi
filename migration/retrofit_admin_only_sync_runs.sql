-- NOT YET RUN. Prepared during a self-review (2026-09-12) after finding
-- that public.sync_runs' SELECT policy was `auth.role() = 'authenticated'`
-- — readable by ANY logged-in user, not just the site owner. This project's
-- login is open passwordless signup (supabase.auth.signInWithOtp, no
-- allowlist), so in production (https://toreka-soba-navi.vercel.app,
-- already deployed and live) anyone who creates an account can currently
-- read cron run history and raw error_sample text (internal card ids,
-- scraper failure details) directly via the Supabase client — bypassing
-- /admin/sync-status's own page-level gate (src/lib/adminAuth.ts) entirely,
-- since that only restricts the Next.js page, not the underlying row.
--
-- This is a live gap, not a theoretical one: the fix requires two things
-- that only the site owner can do, both outside what this session may do
-- on its own (no production DB writes without explicit go-ahead — see
-- COORDINATION.md, and `git push` is separately blocked by this session's
-- own tool permissions):
--   1. Run this file in the Supabase SQL Editor (after replacing the email
--      literal below with your actual admin email).
--   2. Push the corresponding app-side commit (adminAuth.ts /
--      admin/sync-status/page.tsx) and set ADMIN_EMAIL in Vercel's
--      environment variables — the DB policy alone stops direct
--      Supabase-client reads, but the page itself also needs its own gate
--      deployed to stop rendering the page to non-admins in the first
--      place.
--
-- schema.sql's CREATE TABLE only applies on first creation, so the
-- already-existing production sync_runs table needs this separate
-- drop+recreate to pick up the corrected policy (matching the same
-- constraint noted in retrofit_check_constraints.sql for a different
-- schema.sql-only-applies-once gap).

drop policy if exists "authenticated users can view sync runs" on public.sync_runs;

create policy "only admin can view sync runs"
  on public.sync_runs for select
  using ((auth.jwt() ->> 'email') = 'REPLACE_WITH_YOUR_ADMIN_EMAIL');
