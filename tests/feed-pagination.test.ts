import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  FEED_PAGE_SIZE,
  feedPageQuery,
} from "../src/lib/posts";

/* Solved filter (20260907): solved=true appends the solved_at
   predicate. */
test("feedPageQuery: solved filter adds the solved_at predicate", () => {
  assert.match(feedPageQuery({ sort: "new", solved: true }).sql, /p\.solved_at IS NOT NULL/);
  assert.doesNotMatch(feedPageQuery({ sort: "new" }).sql, /solved_at IS NOT NULL/);
});

test("page size is 50 posts per page, over-fetching one", () => {
  assert.equal(FEED_PAGE_SIZE, 50);
  const { sql } = feedPageQuery({ sort: "hot", asOf: 1_760_000_000 });
  assert.match(sql, new RegExp(`LIMIT ${FEED_PAGE_SIZE + 1}`));
});

test("hot tab orders by the pinned-as-of hot score with id tiebreak", () => {
  const { sql, args } = feedPageQuery({ sort: "hot", asOf: 1_760_000_000 });
  /* The baseline instant is pinned (FROM_UNIXTIME, not NOW()): scores
     recompute exactly within one paging session. */
  assert.match(sql, /FROM_UNIXTIME\(1760000000\)/);
  /* The comment_count UNSIGNED x score SIGNED trap: the CAST stays. */
  assert.match(sql, /CAST\(p\.comment_count AS SIGNED\)/);
  assert.match(sql, /AS hot/);
  assert.match(sql, /ORDER BY hot DESC, p\.id DESC/);
  assert.deepEqual(args, []);
});

test("hot cursor is composite (asOf|hot|id) and the predicate is a keyset over (hot, id)", () => {
  const cursor = decodeFeedCursor("1760000000|1.5|42", true)!;
  assert.deepEqual(cursor, { id: 42, hot: 1.5, asOf: 1_760_000_000 });
  const { sql, args } = feedPageQuery({ sort: "hot", asOf: 1_760_000_100, cursor });
  /* The cursor's asOf overrides the caller's: one paging session keeps
     page 1's baseline. */
  assert.equal(sql.includes("FROM_UNIXTIME(1760000000)"), true);
  assert.equal(sql.includes("FROM_UNIXTIME(1760000100)"), false);
  assert.equal(args.filter((a) => a === 1.5).length, 2);
  assert.deepEqual(args.slice(-3), [1.5, 1.5, 42]);
});

test("new tab pages by id cursor (id is monotonic with created_at)", () => {
  const { sql, args } = feedPageQuery({
    sort: "new",
    cursor: decodeFeedCursor("42", false)!,
  });
  assert.match(sql, /p\.id < \?/);
  assert.match(sql, /ORDER BY p\.created_at DESC, p\.id DESC/);
  assert.equal(sql.includes("FROM_UNIXTIME"), false);
  assert.deepEqual(args, [42]);
});

test("sub tab is time-ordered even when sort=hot, and keeps the subscription join", () => {
  const { sql, args } = feedPageQuery({
    sort: "hot",
    subscriberId: 7,
    asOf: 1_760_000_000,
    cursor: { id: 99 },
  });
  assert.match(sql, /JOIN post_subscriptions ps ON ps\.post_id = p\.id AND ps\.user_id = \?/);
  /* The subscribed tab orders by time, computing no hot score. */
  assert.equal(sql.includes("FROM_UNIXTIME"), false);
  assert.match(sql, /ORDER BY p\.created_at DESC, p\.id DESC/);
  assert.deepEqual(args, [7, 99]);
});

test("viewer/category filters keep their argument order before the cursor args", () => {
  const { sql, args } = feedPageQuery({
    sort: "new",
    viewerId: 5,
    category: "showcase",
    cursor: { id: 10 },
  });
  assert.match(sql, /p\.visibility = 'public' OR p\.user_id = \?/);
  /* Moderation hiding: hidden posts filtered publicly, the author
     still sees their own. */
  assert.match(sql, /p\.hidden_at IS NULL OR p\.user_id = \?/);
  assert.match(sql, /rd\.kind = 'down'/);
  assert.match(sql, /p\.category = \?/);
  assert.deepEqual(args, [5, 5, 5, "showcase", 10]);
});

test("invalid categories are ignored rather than filtering everything out", () => {
  const { sql, args } = feedPageQuery({ sort: "new", category: "nope" });
  assert.equal(sql.includes("p.category = ?"), false);
  assert.deepEqual(args, []);
});

test("cursor encode/decode round-trips and rejects malformed input", () => {
  assert.equal(encodeFeedCursor({ id: 42 }), "42");
  assert.equal(
    encodeFeedCursor({ id: 42, hot: 1.5, asOf: 1_760_000_000 }),
    "1760000000|1.5|42",
  );
  assert.deepEqual(decodeFeedCursor("42", false), { id: 42 });
  /* Time cursors reject composite strings, hot cursors reject bare ids
     — no cross-tab reuse. */
  assert.equal(decodeFeedCursor("1760000000|1.5|42", false), null);
  assert.equal(decodeFeedCursor("42", true), null);
  assert.equal(decodeFeedCursor("abc", false), null);
  assert.equal(decodeFeedCursor("0", false), null);
  assert.equal(decodeFeedCursor("1760000000|x|42", true), null);
  assert.equal(decodeFeedCursor("", false), null);
});
