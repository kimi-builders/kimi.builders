-- Harden the error event contract without rewriting the applied table migration.
-- Release and source attribution are server-owned; account linkage is removed.
-- Fingerprints group repeated diagnostics while keeping individual event counts.

ALTER TABLE error_events
  ADD COLUMN fingerprint CHAR(64) NULL AFTER `release`;

UPDATE error_events
SET fingerprint = SHA2(
  CONCAT(
    source,
    CHAR(0),
    `release`,
    CHAR(0),
    LEFT(message, 80),
    CHAR(0),
    LEFT(SUBSTRING_INDEX(COALESCE(stack, ''), CHAR(10), 2), 120)
  ),
  256
)
WHERE fingerprint IS NULL;

ALTER TABLE error_events
  DROP FOREIGN KEY fk_error_event_user;

ALTER TABLE error_events
  DROP COLUMN user_id,
  MODIFY source VARCHAR(16) NOT NULL COMMENT 'client/global/csp',
  MODIFY `release` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'Server-owned deployment git SHA',
  MODIFY fingerprint CHAR(64) NOT NULL COMMENT 'SHA-256 diagnostic grouping key',
  ADD KEY idx_error_fingerprint (fingerprint, created_at);
