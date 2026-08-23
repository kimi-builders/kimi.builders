-- Remove historical double-submit rows created before comment writes became
-- idempotent. The five-second window, exact parent, author, and binary body
-- match keep this cleanup narrower than the live 60-second retry guard.
CREATE TABLE IF NOT EXISTS _comment_retry_duplicate_cleanup (
  duplicate_id BIGINT UNSIGNED PRIMARY KEY,
  canonical_id BIGINT UNSIGNED NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  KEY idx_retry_cleanup_canonical (canonical_id),
  KEY idx_retry_cleanup_post (post_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO _comment_retry_duplicate_cleanup (duplicate_id, canonical_id, post_id)
SELECT later.id, MIN(earlier.id), later.post_id
FROM comments later
JOIN comments earlier
  ON earlier.post_id = later.post_id
 AND later.parent_id <=> earlier.parent_id
 AND later.user_id = earlier.user_id
 AND BINARY later.body_md = BINARY earlier.body_md
 AND earlier.id < later.id
 AND TIMESTAMPDIFF(SECOND, earlier.created_at, later.created_at) BETWEEN 0 AND 5
WHERE later.user_id IS NOT NULL
  AND later.is_ai = 0
  AND earlier.is_ai = 0
  AND later.edited_at IS NULL
  AND earlier.edited_at IS NULL
  AND later.deleted_at IS NULL
  AND earlier.deleted_at IS NULL
  AND later.hidden_at IS NULL
  AND earlier.hidden_at IS NULL
GROUP BY later.id, later.post_id;

-- Preserve one reaction per member and kind before moving the remaining
-- reactions onto the canonical comment.
DELETE duplicate_reaction
FROM reactions duplicate_reaction
JOIN _comment_retry_duplicate_cleanup cleanup
  ON duplicate_reaction.target_type = 'comment'
 AND duplicate_reaction.target_id = cleanup.duplicate_id
JOIN reactions canonical_reaction
  ON canonical_reaction.target_type = 'comment'
 AND canonical_reaction.target_id = cleanup.canonical_id
 AND canonical_reaction.user_id = duplicate_reaction.user_id
 AND canonical_reaction.kind = duplicate_reaction.kind;

UPDATE reactions reaction
JOIN _comment_retry_duplicate_cleanup cleanup
  ON reaction.target_type = 'comment'
 AND reaction.target_id = cleanup.duplicate_id
SET reaction.target_id = cleanup.canonical_id;

UPDATE notifications notification
JOIN _comment_retry_duplicate_cleanup cleanup
  ON notification.comment_id = cleanup.duplicate_id
SET notification.comment_id = cleanup.canonical_id;

UPDATE ai_reply_jobs job
JOIN _comment_retry_duplicate_cleanup cleanup
  ON job.comment_id = cleanup.duplicate_id
SET job.comment_id = cleanup.canonical_id;

-- Replies remain in the discussion and now point to the surviving comment.
UPDATE comments child
JOIN _comment_retry_duplicate_cleanup cleanup
  ON child.parent_id = cleanup.duplicate_id
SET child.parent_id = cleanup.canonical_id;

UPDATE comments duplicate_comment
JOIN _comment_retry_duplicate_cleanup cleanup
  ON duplicate_comment.id = cleanup.duplicate_id
SET duplicate_comment.deleted_at = COALESCE(duplicate_comment.deleted_at, UTC_TIMESTAMP());

UPDATE comments canonical_comment
JOIN (
  SELECT cleanup.canonical_id,
    COALESCE(SUM(CASE reaction.kind WHEN 'up' THEN 1 WHEN 'down' THEN -1 ELSE 0 END), 0) AS score
  FROM _comment_retry_duplicate_cleanup cleanup
  LEFT JOIN reactions reaction
    ON reaction.target_type = 'comment'
   AND reaction.target_id = cleanup.canonical_id
  GROUP BY cleanup.canonical_id
) totals ON totals.canonical_id = canonical_comment.id
SET canonical_comment.score = totals.score;

UPDATE posts post
JOIN (
  SELECT DISTINCT post_id FROM _comment_retry_duplicate_cleanup
) affected ON affected.post_id = post.id
SET post.comment_count = (
  SELECT COUNT(*)
  FROM comments comment
  WHERE comment.post_id = post.id
    AND comment.deleted_at IS NULL
    AND comment.hidden_at IS NULL
);

DROP TABLE _comment_retry_duplicate_cleanup;
