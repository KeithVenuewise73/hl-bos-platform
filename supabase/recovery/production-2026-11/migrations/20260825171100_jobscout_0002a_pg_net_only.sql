-- pg_net only. This is the database's HTTP client, needed to invoke an edge
-- function from inside Postgres.
--
-- Deliberately NOT pg_cron and NOT the schedules. Installing this lets a run be
-- triggered by hand; it starts nothing on its own and spends nothing.
create extension if not exists pg_net;