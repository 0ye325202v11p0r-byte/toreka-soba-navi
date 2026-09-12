-- NOT YET RUN. Prepared during a self-review (2026-09-12) after finding
-- that public.sync_runs' SELECT policy was `auth.role() = 'authenticated'`
-- — readable by ANY logged-in user, not just the site owner. This project's
-- login is open passwordless signup (supabase.auth.signInWithOtp, no
-- allowlist).
--
-- Epistemic note added 2026-09-13 (Codex independent review asked that this
-- distinction be explicit): README.md states Phase 1/2 were deployed to
-- production (https://toreka-soba-navi.vercel.app), and the vulnerable
-- policy text above is what this session found in the LOCAL supabase/
-- schema.sql before this fix. Neither this session nor Codex has actually
-- queried the live production database or signed into the live site with a
-- second test account to directly confirm the deployed policy still reads
-- this way — it is a strong inference from local code + README, not a
-- directly observed fact about the current production state. Treat "this
-- is a live gap" claims elsewhere in COORDINATION.md the same way unless a
-- specific entry says otherwise.
--
-- If accurate, closing it requires two things that only the site owner can
-- do, both outside what this session may do on its own (no production DB
-- writes without explicit go-ahead — see COORDINATION.md, and `git push` is
-- separately blocked by this session's own tool permissions):
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
--
-- lower(trim(...)) on both sides, and dropping "only admin can view sync
-- runs" before recreating it (Codex independent review, 2026-09-13):
-- src/lib/adminAuth.ts's isAdminUser() trims and lowercases before
-- comparing; this policy originally did not, so the SAME ADMIN_EMAIL typed
-- with different case or a stray space in .env.local/Vercel vs. this SQL
-- literal could pass the app-side page gate while the DB policy silently
-- returned zero rows — a confusing self-lockout for the real owner, not a
-- security leak. This also makes the file safe to re-run if you ever
-- rotate the admin email: without the second DROP, a second run would fail
-- with "policy already exists" the moment the first run had already
-- succeeded (Postgres has no `create policy if not exists`).

drop policy if exists "authenticated users can view sync runs" on public.sync_runs;
drop policy if exists "only admin can view sync runs" on public.sync_runs;

create policy "only admin can view sync runs"
  on public.sync_runs for select
  using (lower(trim(auth.jwt() ->> 'email')) = lower(trim('REPLACE_WITH_YOUR_ADMIN_EMAIL')));
