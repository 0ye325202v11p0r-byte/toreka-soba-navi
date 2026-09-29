#!/bin/bash
rm -f /tmp/pgw/data/postmaster.pid
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgw/data -o '-p 55432 -k /tmp/pgw' -l /tmp/pgw/log start" >/dev/null
sleep 2
cd /tmp/pgw/e2e
nohup /tmp/pgw/bin/postgrest pgrst.conf > pgrst.log 2>&1 &
nohup /tmp/pgw/bin/stripe-mock -http-port 12111 -https-port 12112 > /tmp/pgw/stripe-mock.log 2>&1 &
JWT_SECRET="e2e-local-jwt-secret-0123456789abcdef" PG_MODULE=/tmp/pgw/e2e/node_modules/pg nohup node fake-supabase.js > fake.log 2>&1 &
sleep 4
nohup node /tmp/pgw/e2e/stripe-shim.js > /tmp/pgw/e2e/shim.log 2>&1 &
