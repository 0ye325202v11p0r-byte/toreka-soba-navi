\set ON_ERROR_STOP 0
\set QUIET 1
-- fixtures (as postgres)
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K');
insert into requests(id,client_id,title,description,garment_type) values
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','t','d','訪問着');
insert into proposals(id,request_id,craftsman_id,price,message) values
 ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',50000,'m');
insert into orders(id,client_id,craftsman_id,title,price,status,payment_status) values
 ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','o',50000,'pending_payment','unpaid'),
 ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','o2',50000,'in_progress','paid');
\set QUIET 0

\echo ==== CLIENT session
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client inserts order directly
insert into orders(client_id,craftsman_id,title,price,status,payment_status) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','x',999999,'delivered','paid');
\echo [expect FAIL] client marks pending order paid
update orders set payment_status='paid' where id='55555555-5555-5555-5555-555555555555';
\echo [expect FAIL] client skips payment -> in_progress
update orders set status='in_progress' where id='55555555-5555-5555-5555-555555555555';
\echo [expect FAIL] client changes price
update orders set price=1 where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] client approves fabric check before it is recorded
update orders set fabric_check_approved_at=now() where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] client lowers proposal price
update proposals set price=1 where id='44444444-4444-4444-4444-444444444444';
\echo [expect OK 1] client writes checkout session id (legit path)
update orders set stripe_checkout_session_id='cs_test' where id='55555555-5555-5555-5555-555555555555';
\echo [expect OK 1] client counters proposal (legit path)
update proposals set status='countered', countered_price=45000, countered_message='m2' where id='44444444-4444-4444-4444-444444444444';

\echo ==== CRAFTSMAN session
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect FAIL] craftsman jumps in_progress -> completed
update orders set status='completed' where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] craftsman raises countered price himself
update proposals set countered_price=90000 where id='44444444-4444-4444-4444-444444444444';
\echo [expect OK 1] craftsman records fabric check (legit)
update orders set fabric_check_damage=true, fabric_check_completed_at='2000-01-01' where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] craftsman approves own fabric check
update orders set fabric_check_approved_at=now() where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] craftsman delivers before fabric approval
update orders set status='delivered' where id='66666666-6666-6666-6666-666666666666';

\echo ==== CLIENT approves
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect OK 1] client approves fabric check (legit)
update orders set fabric_check_approved_at='2000-01-01' where id='66666666-6666-6666-6666-666666666666';

\echo ==== CRAFTSMAN delivers with backdated delivered_at
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect OK 1] craftsman delivers (legit), backdate attempt ignored
update orders set status='delivered', delivered_at='2000-01-01', shipping_method='ゆうパック' where id='66666666-6666-6666-6666-666666666666';
\echo [expect FAIL] craftsman completes
update orders set status='completed' where id='66666666-6666-6666-6666-666666666666';

\echo ==== CLIENT completes
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect OK 1] client completes (legit)
update orders set status='completed', completed_at=null where id='66666666-6666-6666-6666-666666666666';
\echo [expect OK 1] client cancels pending order (legit)
update orders set status='cancelled', completed_at=null where id='55555555-5555-5555-5555-555555555555';

\echo ==== SERVICE ROLE (webhook/escrow)
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
\echo [expect OK 1] service role sets transferred
update orders set payment_status='transferred', stripe_transfer_id='tr_1', platform_fee_amount=9000 where id='66666666-6666-6666-6666-666666666666';
\echo [expect OK 1] service role inserts order
insert into orders(client_id,craftsman_id,title,price,status) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','svc',1000,'pending_payment');
\echo [expect OK 1] service role sets accepted-counter price
update proposals set status='accepted', price=45000 where id='44444444-4444-4444-4444-444444444444';

reset role;
select title, status, payment_status, fabric_check_completed_at > '2020-01-01' as fc_now, fabric_check_approved_at > '2020-01-01' as fa_now, delivered_at > '2020-01-01' as deliv_now, completed_at is not null as completed_set, shipping_method from orders order by title;
