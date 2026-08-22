import assert from "node:assert/strict";
import test from "node:test";
import { UPCOMING } from "../src/lib/upcoming";
import {
  railDecisionKey,
  railFor,
} from "../app/(app)/_components/right-rail";
import { relatedPostsQuery } from "../src/lib/posts";
import { awesomeSourceStatsQuery, relatedWorksQuery } from "../src/lib/works";

/* ---- Rail registry railFor: route segment -> rail context + main
   column width ---- */

test("railFor: community feed and unlisted routes fall back to community rail", () => {
  assert.deepEqual(railFor("/community"), { kind: "community", id: null, wide: false });
  /* Unlisted routes (/settings, /demo-night, /community subpages) match
     the pre-rework behavior; /works has its own rail. */
  assert.deepEqual(railFor("/settings"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/demo-night"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/works"), { kind: "works", id: null, wide: false });
  assert.deepEqual(railFor("/community/new"), { kind: "community", id: null, wide: false });
  /* Notifications page: same community rail, but the id=0 sentinel gives
     its own decision key (a visit marks everything read, forcing a shell
     re-evaluation to clear the badge — see railFor and the decision-key
     tests below). */
  assert.deepEqual(railFor("/community/notifications"), { kind: "community", id: 0, wide: false });
  /* When the header is missing, the layout passes "/". */
  assert.deepEqual(railFor("/"), { kind: "community", id: null, wide: false });
  /* Admin console: no rail + wide canvas, same tier as /usage and the
     profile. */
  assert.deepEqual(railFor("/admin"), { kind: "none", id: null, wide: true });
});

test("railFor: post/work detail get contextual rails with route id", () => {
  assert.deepEqual(railFor("/community/123"), { kind: "post", id: 123, wide: false });
  assert.deepEqual(railFor("/works/7"), { kind: "work", id: 7, wide: false });
  /* Trailing slash normalization. */
  assert.deepEqual(railFor("/community/123/"), { kind: "post", id: 123, wide: false });
  /* /edit subpages are not detail pages. */
  assert.deepEqual(railFor("/community/123/edit"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/works/7/edit"), { kind: "community", id: null, wide: false });
  /* Non-numeric ids don't make a detail page. */
  assert.deepEqual(railFor("/community/abc"), { kind: "community", id: null, wide: false });
});

test("railFor: awesome / explore sections", () => {
  assert.deepEqual(railFor("/awesome"), { kind: "awesome", id: null, wide: false });
  /* While a section isn't ready (src/lib/upcoming.ts), its dedicated rail
     falls back to community; it returns once ready. */
  const exploreRail = UPCOMING.explore ? "community" : "explore";
  assert.deepEqual(railFor("/explore"), { kind: exploreRail, id: null, wide: false });
  /* Series pages share the explore rail (series stay unshown for now,
     routes kept). */
  assert.deepEqual(railFor("/explore/series/kimi-code-in-action"), { kind: exploreRail, id: null, wide: false });
  /* Article detail has its own article rail: metadata in the rail, the
     slug enters the decision. */
  if (!UPCOMING.explore) {
    assert.deepEqual(railFor("/explore/2026-08-letter"), {
      kind: "article",
      id: null,
      slug: "2026-08-letter",
      wide: false,
    });
    /* The slug rides the decision key: two article pages re-evaluate
       their rails independently, no shared shell cache. */
    const keyFor = (pathname: string) => railDecisionKey(railFor(pathname));
    assert.notEqual(keyFor("/explore/issue-a"), keyFor("/explore/issue-b"));
    /* Also a different key from the catalog page. */
    assert.notEqual(keyFor("/explore"), keyFor("/explore/2026-08-letter"));
  }
  /* Legacy routes are 301s (handled at the page layer); the rail still
     falls back to default. */
  assert.deepEqual(railFor("/blog"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/learn"), { kind: "community", id: null, wide: false });
  /* Admin edit pages fall back to default. */
  assert.deepEqual(railFor("/blog/admin/new"), { kind: "community", id: null, wide: false });
  assert.deepEqual(railFor("/blog/admin/x/edit"), { kind: "community", id: null, wide: false });
});

test("railFor: usage and profiles have no rail and a wide canvas", () => {
  assert.deepEqual(railFor("/usage"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/usage/device"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/usage/leaderboard"), { kind: "none", id: null, wide: true });
  assert.deepEqual(railFor("/u/aklman"), { kind: "none", id: null, wide: true });
});

test("rail decision key: same shell context survives pathname changes", () => {
  const keyFor = (pathname: string) => railDecisionKey(railFor(pathname));
  assert.equal(keyFor("/community"), keyFor("/settings"));
  assert.equal(keyFor("/settings"), keyFor("/demo-night"));
  assert.equal(keyFor("/usage/device"), keyFor("/usage/leaderboard"));
  assert.equal(keyFor("/usage"), keyFor("/u/another-handle"));
  assert.equal(keyFor("/blog/issue-a"), keyFor("/blog/issue-b"));
  assert.equal(keyFor("/learn/start"), keyFor("/learn/advanced"));
});

test("rail decision key: context, detail id, and width changes are distinct", () => {
  const keyFor = (pathname: string) => railDecisionKey(railFor(pathname));
  assert.notEqual(keyFor("/community"), keyFor("/works"));
  assert.notEqual(keyFor("/community/1"), keyFor("/community/2"));
  assert.notEqual(keyFor("/works/1"), keyFor("/works/2"));
  assert.notEqual(
    railDecisionKey({ kind: "community", id: null, wide: false }),
    railDecisionKey({ kind: "community", id: null, wide: true }),
  );
});

test("rail decision key: notifications gets its own key so the unread badge re-evaluates", () => {
  /* A notifications visit marks everything read, but the top-bar badge
     renders in the layout: the same key triggers no shell refetch and
     the badge would linger — an independent key refreshes once on each
     way in and out. */
  const keyFor = (pathname: string) => railDecisionKey(railFor(pathname));
  assert.equal(railFor("/community/notifications").kind, "community");
  assert.notEqual(keyFor("/community/notifications"), keyFor("/community"));
});

/* ---- Related posts: recent public posts in the same category,
   excluding this one ---- */

test("relatedPostsQuery: same category, public only, excludes self, newest first", () => {
  const { sql, args } = relatedPostsQuery(42, "showcase");
  assert.match(sql, /p\.deleted_at IS NULL/);
  /* The rail is a public context: private posts never leak through it. */
  assert.match(sql, /p\.visibility = 'public'/);
  assert.match(sql, /p\.category = \?/);
  assert.match(sql, /p\.id <> \?/);
  assert.match(sql, /ORDER BY p\.created_at DESC, p\.id DESC LIMIT 5/);
  assert.deepEqual(args, ["showcase", 42]);
});

test("relatedPostsQuery: limit is clamped and inlined as integer", () => {
  assert.match(relatedPostsQuery(1, "general", 0).sql, /LIMIT 1/);
  assert.match(relatedPostsQuery(1, "general", 99).sql, /LIMIT 20/);
  assert.match(relatedPostsQuery(1, "general", 3.9).sql, /LIMIT 3/);
});

/* ---- Related works: same author or shared agent, same author first
   ---- */

test("relatedWorksQuery: author OR agent overlap, author first, excludes self", () => {
  const q = relatedWorksQuery({ id: 9, userId: 3, agents: ["kimi", "claude"] });
  assert.ok(q);
  const { sql, args } = q;
  assert.match(sql, /w\.id <> \?/);
  assert.match(sql, /w\.user_id = \?/);
  assert.match(sql, /JSON_OVERLAPS\(w\.agents, \?\)/);
  /* Same author first, the rest newest first; the ? in the ORDER BY
     binds in order after the WHERE. */
  assert.match(sql, /ORDER BY \(w\.user_id = \?\) DESC, w\.id DESC LIMIT 5/);
  assert.deepEqual(args, [9, 3, '["kimi","claude"]', 3]);
});

test("relatedWorksQuery: external entry (no author) matches by agent only", () => {
  const q = relatedWorksQuery({ id: 9, userId: null, agents: ["kimi"] });
  assert.ok(q);
  assert.match(q.sql, /JSON_OVERLAPS\(w\.agents, \?\)/);
  assert.doesNotMatch(q.sql, /w\.user_id = \?/);
  assert.deepEqual(q.args, [9, '["kimi"]']);
});

test("relatedWorksQuery: no author and no agents → null (caller skips the query)", () => {
  assert.equal(relatedWorksQuery({ id: 9, userId: null, agents: [] }), null);
});

/* ---- /awesome source stats ---- */

test("awesomeSourceStatsQuery: group by source for site/external counts (public only)", () => {
  const { sql, args } = awesomeSourceStatsQuery();
  assert.match(sql, /SELECT w\.source, COUNT\(\*\) AS n FROM works w WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL GROUP BY w\.source/);
  assert.deepEqual(args, []);
});
