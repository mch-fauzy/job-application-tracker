-- audit_log is append-only: also block TRUNCATE (row triggers do not fire on it).
-- Reuses audit_log_block_mutation() from 0001, which raises on any TG_OP.
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
--> statement-breakpoint
-- defense-in-depth: fully effective when the app connects as a non-owner role
REVOKE TRUNCATE ON audit_log FROM PUBLIC;
