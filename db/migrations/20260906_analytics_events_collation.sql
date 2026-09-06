-- analytics_events was created by 20260903 without an explicit
-- ENGINE/CHARSET/COLLATE clause, so each database inherited its own
-- default: local dev ended at utf8mb4_0900_ai_ci while schema.sql and
-- the CI databases pin utf8mb4_unicode_ci. Pin the table to the schema
-- collation; string comparisons against other tables would otherwise
-- risk "Illegal mix of collations" on hosts whose default differs.
-- schema.sql already declares the target collation, so no schema.sql
-- change accompanies this file. Require online DDL so deployment fails
-- closed instead of silently falling back to a blocking table copy.
ALTER TABLE analytics_events
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  ALGORITHM=INPLACE,
  LOCK=NONE;
