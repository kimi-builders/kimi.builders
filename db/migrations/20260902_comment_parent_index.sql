-- The recursive comment tree repeatedly joins each frontier id to its direct
-- children. Keep visibility and AI predicates in the same covering lookup.
ALTER TABLE comments
  ADD KEY idx_comments_parent_visible
    (parent_id, deleted_at, hidden_at, is_ai);
