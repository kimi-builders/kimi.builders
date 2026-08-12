-- Public and signed-in latest feeds share deleted_at = NULL and preserve the
-- product order (created_at DESC, id DESC). Reverse scanning this index avoids
-- a full posts scan + filesort; category feeds keep using idx_feed.
ALTER TABLE posts
  ADD KEY idx_posts_live_new (deleted_at, created_at, id);
