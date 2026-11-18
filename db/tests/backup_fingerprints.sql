-- Deterministic fingerprints of all public tables in the disposable CI database.
-- Do not run on a production database. Each table is aggregated in memory.
SELECT format(
 'SELECT %L, count(*), md5(coalesce(string_agg(row_data, E''\n'' ORDER BY row_data COLLATE "C"), ''''))
  FROM (SELECT to_jsonb(t)::text AS row_data FROM %I.%I t) fixture_rows',
 tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename COLLATE "C"
\gexec
