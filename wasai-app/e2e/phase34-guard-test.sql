\set ON_ERROR_STOP 0
\set QUIET 1
-- Phase 34（トップ画像・メニュー写真・登録区分の書き換え防止）のDB単体テスト。
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K');
insert into services(id,craftsman_id,title,description,garment_type,price,delivery_days) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','t','d','訪問着',1000,14);
\set QUIET 0

\echo ==== CLIENT C
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client turns themselves into a craftsman
update profiles set role='craftsman' where id='11111111-1111-1111-1111-111111111111';
\echo [expect OK 1] client still edits their own name
update profiles set display_name='C2' where id='11111111-1111-1111-1111-111111111111';
\echo [expect OK 1] client sets a cover image URL
update profiles set cover_url='https://example.com/a.jpg' where id='11111111-1111-1111-1111-111111111111';
\echo [expect FAIL] cover image that is not a web URL
update profiles set cover_url='javascript:alert(1)' where id='11111111-1111-1111-1111-111111111111';
\echo [expect OK 0] client cannot set a photo on someone else s menu
update services set image_url='https://example.com/x.jpg' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo ==== CRAFTSMAN K
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect FAIL] craftsman turns themselves into a client
update profiles set role='client' where id='22222222-2222-2222-2222-222222222222';
\echo [expect OK 1] craftsman sets a photo on their own menu
update services set image_url='https://example.com/m.jpg' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
\echo [expect FAIL] menu photo that is not a web URL
update services set image_url='data:text/html,x' where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo ==== SERVICE ROLE
reset role;
set request.jwt.claims = '{"role":"service_role"}';
\echo [expect OK 1] service role can still change a role (support/admin fix)
update profiles set role='craftsman' where id='11111111-1111-1111-1111-111111111111';
