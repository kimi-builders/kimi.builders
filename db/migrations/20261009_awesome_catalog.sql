CREATE TABLE IF NOT EXISTS awesome_entries (
  entry_id VARCHAR(80) NOT NULL PRIMARY KEY,
  work_id BIGINT UNSIGNED NOT NULL,
  ownership VARCHAR(16) NOT NULL,
  publication VARCHAR(16) NOT NULL,
  entry_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  applied_fields JSON NULL,
  source_revision CHAR(40) NOT NULL,
  UNIQUE KEY uq_awesome_work (work_id),
  CONSTRAINT fk_awesome_work FOREIGN KEY (work_id) REFERENCES works (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS awesome_sync_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(16) NOT NULL,
  source_revision CHAR(40) NULL,
  snapshot_hash CHAR(64) NULL,
  status VARCHAR(16) NOT NULL,
  counts JSON NULL,
  changes_json JSON NULL,
  error_code VARCHAR(64) NULL,
  cache_pending TINYINT(1) NOT NULL DEFAULT 0,
  rolled_back_by BIGINT UNSIGNED NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  KEY idx_awesome_sync_status (status,finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
