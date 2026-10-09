ALTER TABLE awesome_entries DROP FOREIGN KEY fk_awesome_work;
ALTER TABLE awesome_entries MODIFY work_id BIGINT UNSIGNED NULL;
ALTER TABLE awesome_entries ADD CONSTRAINT fk_awesome_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE SET NULL;
