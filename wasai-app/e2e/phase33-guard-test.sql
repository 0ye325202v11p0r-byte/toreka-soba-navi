\set ON_ERROR_STOP 0
\set QUIET 1
-- Phase 33（指名依頼・寸法・お気に入り・お問い合わせ）のDB単体テスト。
-- 11 = 依頼者C、22 = 和裁士K（指名される）、33 = 和裁士L（指名されない）、44 = 別の依頼者D
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','c@x'),('22222222-2222-2222-2222-222222222222','k@x'),
 ('33333333-3333-3333-3333-333333333333','l@x'),('44444444-4444-4444-4444-444444444444','d@x');
insert into profiles(id,role,display_name) values
 ('11111111-1111-1111-1111-111111111111','client','C'),('22222222-2222-2222-2222-222222222222','craftsman','K'),
 ('33333333-3333-3333-3333-333333333333','craftsman','L'),('44444444-4444-4444-4444-444444444444','client','D');
insert into requests(id,client_id,title,description,garment_type,directed_to) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','directed','d','訪問着','22222222-2222-2222-2222-222222222222'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','public','d','訪問着',null);
insert into requests(id,client_id,title,description,garment_type,status) values
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','closed','d','訪問着','closed');
insert into inquiries(user_id,name,email,category,body) values
 ('44444444-4444-4444-4444-444444444444','D','d@example.com','その他','someone else inquiry');
\set QUIET 0

\echo ==== CLIENT C
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
\echo [expect OK 1] client sends a directed request to craftsman K
insert into requests(client_id,title,description,garment_type,directed_to) values ('11111111-1111-1111-1111-111111111111','to K','d','訪問着','22222222-2222-2222-2222-222222222222');
\echo [expect FAIL] directed request to a client account (not a craftsman)
insert into requests(client_id,title,description,garment_type,directed_to) values ('11111111-1111-1111-1111-111111111111','to D','d','訪問着','44444444-4444-4444-4444-444444444444');
\echo [expect FAIL] directed request to an account that does not exist
insert into requests(client_id,title,description,garment_type,directed_to) values ('11111111-1111-1111-1111-111111111111','to nobody','d','訪問着','99999999-9999-9999-9999-999999999999');
\echo [expect OK 1] client saves measurements for own request
insert into request_measurements(request_id,client_id,height_cm,yuki_cm,hip_cm) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',158,64,92);
\echo [expect OK 1] client saves measurements for the public request
insert into request_measurements(request_id,client_id,height_cm,hip_cm) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111',160,90);
\echo [expect FAIL] impossible measurement (yuki 500cm)
update request_measurements set yuki_cm=500 where request_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo [expect OK 1] client favorites craftsman K
insert into favorites(client_id,craftsman_id) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
\echo [expect FAIL] client favorites another client (not a craftsman)
insert into favorites(client_id,craftsman_id) values ('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444');
\echo [expect OK 1] client cannot read any inquiry (0 rows although one exists)
select 1 where (select count(*) from inquiries) = 0;
\echo [expect FAIL] client writes an inquiry directly
insert into inquiries(name,email,category,body) values ('x','x@x','その他','b');

\echo ==== CLIENT D (someone else)
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
\echo [expect OK 1] D sees only the public open request among C requests (2 visible: public + closed)
select case when count(*) = 2 then 1 end as ok from requests where client_id='11111111-1111-1111-1111-111111111111' having count(*) = 2;
\echo [expect FAIL] D saves measurements onto C request
insert into request_measurements(request_id,client_id,height_cm) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','44444444-4444-4444-4444-444444444444',150);
\echo [expect OK 1] D cannot read C measurements (0 rows)
select 1 where (select count(*) from request_measurements) = 0;
\echo [expect OK 1] D cannot see C favorites (0 rows)
select 1 where (select count(*) from favorites) = 0;

\echo ==== CRAFTSMAN L (not directed)
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
\echo [expect OK 1] L does not see the request directed to K
select 1 where (select count(*) from requests where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0;
\echo [expect FAIL] L proposes on the request directed to K
insert into proposals(request_id,craftsman_id,price,message) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333',10000,'m');
\echo [expect FAIL] L proposes on a closed request
insert into proposals(request_id,craftsman_id,price,message) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333',10000,'m');
\echo [expect OK 1] L proposes on the public open request (legit)
insert into proposals(request_id,craftsman_id,price,message,delivery_days) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333',10000,'m',14);
\echo [expect OK 1] L reads measurements of the public request only (1 row)
select 1 where (select count(*) from request_measurements) = 1;

\echo ==== CRAFTSMAN K (directed)
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
\echo [expect OK 1] K sees the request directed to K
select 1 where (select count(*) from requests where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1;
\echo [expect OK 1] K proposes on the request directed to K (legit)
insert into proposals(request_id,craftsman_id,price,message,delivery_days) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',20000,'m',21);
\echo [expect OK 1] K reads both measurements (2 rows)
select 1 where (select count(*) from request_measurements) = 2;

\echo ==== ANON
set role anon;
set request.jwt.claims = '{"role":"anon"}';
\echo [expect OK 1] anon cannot see the directed request
select 1 where (select count(*) from requests where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0;
\echo [expect OK 1] anon cannot read any measurements
select 1 where (select count(*) from request_measurements) = 0;

\echo ==== SERVICE ROLE
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
\echo [expect OK 1] the site stores an inquiry
insert into inquiries(name,email,category,body) values ('名前','a@example.com','特商法の表示事項の請求','氏名と住所を教えてください');
\echo [expect FAIL] unknown inquiry category
insert into inquiries(name,email,category,body) values ('名前','a@example.com','広告','b');
reset role;
