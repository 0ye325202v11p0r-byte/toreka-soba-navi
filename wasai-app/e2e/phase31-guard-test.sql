\set ON_ERROR_STOP 0
\set QUIET 1
-- Phase 31（提案の納期目安）のDBトリガー単体テスト。
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K');
insert into requests(id,client_id,title,description,garment_type) values
 ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','t','d','訪問着');
\set QUIET 0

\echo ==== CRAFTSMAN
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect FAIL] craftsman submits a proposal with 0 days
insert into proposals(request_id,craftsman_id,price,message,delivery_days) values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',30000,'m',0);
\echo [expect OK 1] craftsman submits a proposal with 21 days (legit)
insert into proposals(id,request_id,craftsman_id,price,message,delivery_days) values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',30000,'m',21);
\echo [expect FAIL] craftsman shortens the promised days after submitting
update proposals set delivery_days=3 where id='44444444-4444-4444-4444-444444444444';

\echo ==== CLIENT
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect FAIL] client changes the days
update proposals set delivery_days=1 where id='44444444-4444-4444-4444-444444444444';
\echo [expect OK 1] client counters the price (legit, days untouched)
update proposals set status='countered', countered_price=25000 where id='44444444-4444-4444-4444-444444444444';

reset role;
select price, countered_price, delivery_days, status from proposals;
