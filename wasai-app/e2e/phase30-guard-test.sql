\set ON_ERROR_STOP 0
\set QUIET 1
-- Phase 30（納品後のキャンセル規則）のDBトリガー単体テスト。
-- fixtures (as postgres): 77 = 納品済み（修正1回まで）, 88 = 納品済み（相談用）,
-- 99 = 進行中・一度も納品されていない
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K');
insert into orders(id,client_id,craftsman_id,title,price,status,payment_status,delivered_at,revision_limit) values
 ('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','o77',30000,'delivered','paid',now(),1),
 ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','o88',30000,'delivered','paid',now(),1),
 ('99999999-9999-9999-9999-999999999999','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','o99',30000,'in_progress','paid',null,1);
\set QUIET 0

\echo ==== CLIENT
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client cancels a delivered order (the old full-refund path)
update orders set status='cancelled' where id='77777777-7777-7777-7777-777777777777';
\echo [expect FAIL] client raises own revision_limit
update orders set revision_limit=5 where id='77777777-7777-7777-7777-777777777777';
\echo [expect OK 1] client requests a revision (delivered -> in_progress)
update orders set status='in_progress', revision_requests_used=-9 where id='77777777-7777-7777-7777-777777777777';
\echo [expect FAIL] client cancels it now that it is back in progress (was delivered once)
update orders set status='cancelled' where id='77777777-7777-7777-7777-777777777777';
\echo [expect OK 1] client cancels an order that was never delivered (legit)
update orders set status='cancelled' where id='99999999-9999-9999-9999-999999999999';
\echo [expect OK 1] client opens a dispute on a delivered order
update orders set disputed_at='2000-01-01' where id='88888888-8888-8888-8888-888888888888';
\echo [expect FAIL] client opens the same dispute again
update orders set disputed_at=now() where id='88888888-8888-8888-8888-888888888888';
\echo [expect FAIL] client requests a revision while disputed
update orders set status='in_progress' where id='88888888-8888-8888-8888-888888888888';

\echo ==== CRAFTSMAN
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect OK 1] craftsman re-delivers after the revision
update orders set status='delivered' where id='77777777-7777-7777-7777-777777777777';
\echo [expect FAIL] craftsman opens a dispute
update orders set disputed_at=now() where id='77777777-7777-7777-7777-777777777777';

\echo ==== CLIENT
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client requests a second revision (limit 1)
update orders set status='in_progress' where id='77777777-7777-7777-7777-777777777777';

\echo ==== CRAFTSMAN
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect OK 1] craftsman agrees to cancel a delivered order
update orders set status='cancelled' where id='77777777-7777-7777-7777-777777777777';

\echo ==== SERVICE ROLE (operator decision)
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
\echo [expect OK 1] operator completes the disputed order
update orders set status='completed', completed_at=now() where id='88888888-8888-8888-8888-888888888888';

reset role;
select title, status, revision_limit, revision_requests_used, disputed_at > '2020-01-01' as disputed_now, delivered_at is not null as delivered_once from orders order by title;
