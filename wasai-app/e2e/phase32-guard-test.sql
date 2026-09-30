\set ON_ERROR_STOP 0
\set QUIET 1
-- Phase 32（通知の偽造防止・和裁士の非公開情報・振込先の保護）のDB単体テスト。
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K');
insert into craftsman_profiles(profile_id, grade, stripe_account_id, stripe_transfers_enabled, certificate_url)
 values ('22222222-2222-2222-2222-222222222222','1級','acct_test',true,'2222/cert.pdf');
\set QUIET 0

\echo ==== ANON
set role anon;
set request.jwt.claims = '{"role":"anon"}';
\echo [expect FAIL] anon reads the Stripe account id of a craftsman
select stripe_account_id from craftsman_profiles;
\echo [expect FAIL] anon reads the certificate path
select certificate_url from craftsman_profiles;
\echo [expect OK 1] anon reads public craftsman columns
select profile_id, grade, specialties from craftsman_profiles;

\echo ==== CLIENT
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client sends the craftsman a fake notification with an outside link
insert into notifications(user_id,type,title,link) values ('22222222-2222-2222-2222-222222222222','x','運営からのお知らせ','https://evil.example');
\echo [expect FAIL] client sends a fake notification with an inside link too
insert into notifications(user_id,type,title,link) values ('22222222-2222-2222-2222-222222222222','x','t','/dashboard');

\echo ==== CRAFTSMAN (own row)
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect FAIL] craftsman select * on own row (private columns need service role)
select * from craftsman_profiles where profile_id='22222222-2222-2222-2222-222222222222';
\echo [expect FAIL] craftsman changes own Stripe account id
update craftsman_profiles set stripe_account_id='acct_other' where profile_id='22222222-2222-2222-2222-222222222222';
\echo [expect FAIL] craftsman marks own payouts enabled
update craftsman_profiles set stripe_transfers_enabled=false where profile_id='22222222-2222-2222-2222-222222222222';
\echo [expect OK 1] craftsman edits specialties (legit)
update craftsman_profiles set specialties='{訪問着}' where profile_id='22222222-2222-2222-2222-222222222222';
\echo [expect OK 1] craftsman records own certificate path (legit)
update craftsman_profiles set certificate_url='2222/cert2.pdf' where profile_id='22222222-2222-2222-2222-222222222222';

\echo ==== SERVICE ROLE
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
\echo [expect FAIL] even service role cannot store an outside link
insert into notifications(user_id,type,title,link) values ('22222222-2222-2222-2222-222222222222','x','t','https://evil.example');
\echo [expect FAIL] nor a protocol-relative one
insert into notifications(user_id,type,title,link) values ('22222222-2222-2222-2222-222222222222','x','t','//evil.example');
\echo [expect OK 1] service role creates a normal notification
insert into notifications(user_id,type,title,link) values ('22222222-2222-2222-2222-222222222222','x','t','/orders/1');
\echo [expect OK 1] service role saves the Stripe account id (onboarding)
update craftsman_profiles set stripe_account_id='acct_new' where profile_id='22222222-2222-2222-2222-222222222222';

reset role;
select stripe_account_id, stripe_transfers_enabled, certificate_url, specialties from craftsman_profiles;
