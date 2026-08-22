import assert from "node:assert/strict";
import test from "node:test";
import { featuredWorksQuery } from "../src/lib/featured";
import { userWorksCountQuery } from "../src/lib/share-posters";
import {
  canViewWork,
  relatedWorksQuery,
  worksPageQuery,
} from "../src/lib/works";

/* The works.visibility SQL definitions: anonymous/visitors see public
   only; a signed-in viewer additionally gets their own private entries
   (like the posts feed). Public contexts (related works/featured/
   stats/posters) are public-only, always. */

test("worksPageQuery: anonymous sees public, non-hidden only (wall and awesome)", () => {
  const wall = worksPageQuery({ source: "site" });
  assert.match(wall.sql, /WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL AND w\.source = 'site'/);
  assert.deepEqual(wall.args, []);
  /* The Awesome listing: recommended entries UNION member works whose
     authors checked "also list". */
  const awesome = worksPageQuery({ source: "awesome" });
  assert.match(awesome.sql, /WHERE w\.visibility = 'public' AND w\.hidden_at IS NULL AND \(w\.source = 'awesome' OR w\.also_awesome = 1\)/);
  assert.deepEqual(awesome.args, []);
});

test("worksPageQuery: viewer additionally sees their own private/hidden entries", () => {
  const { sql, args } = worksPageQuery({ source: "site", viewerId: 7 });
  assert.match(sql, /\(w\.visibility = 'public' OR w\.user_id = \?\)/);
  assert.match(sql, /\(w\.hidden_at IS NULL OR w\.user_id = \?\)/);
  assert.deepEqual(args, [7, 7]);
  /* The visibility predicate leads; the remaining filters/cursors
     follow in order. */
  const both = worksPageQuery({ source: "awesome", viewerId: 7, kinds: ["app"], after: "9" });
  assert.deepEqual(both.args, [7, 7, "app", 9]);
});

test("relatedWorksQuery is a public context (never leaks private/hidden works)", () => {
  const q = relatedWorksQuery({ id: 9, userId: 3, agents: ["kimi"] });
  assert.ok(q);
  assert.match(q.sql, /w\.id <> \? AND w\.visibility = 'public' AND w\.hidden_at IS NULL AND \(/);
});

test("featuredWorksQuery excludes private works from featured slots", () => {
  const { sql } = featuredWorksQuery(3);
  assert.match(sql, /w\.featured_at IS NOT NULL AND w\.visibility = 'public'/);
});

test("userWorksCountQuery: visitor counts public only, self counts all", () => {
  const visitor = userWorksCountQuery(3);
  assert.match(visitor.sql, /AND visibility = 'public'/);
  assert.deepEqual(visitor.args, [3]);
  const self = userWorksCountQuery(3, true);
  assert.doesNotMatch(self.sql, /visibility/);
  assert.deepEqual(self.args, [3]);
});

test("canViewWork: public for anyone, private only for its author", () => {
  const pub = { visibility: "public", userId: 3, hiddenAt: null };
  assert.equal(canViewWork(pub, null), true);
  assert.equal(canViewWork(pub, { id: 99, role: "member" }), true);
  const priv = { visibility: "private", userId: 3, hiddenAt: null };
  assert.equal(canViewWork(priv, { id: 3, role: "member" }), true);
  assert.equal(canViewWork(priv, { id: 99, role: "member" }), false);
  assert.equal(canViewWork(priv, null), false);
  /* Editor-curated entries (user_id NULL) are always public; even a
     mistaken private label admits no one. */
  assert.equal(
    canViewWork({ visibility: "private", userId: null, hiddenAt: null }, { id: 3, role: "member" }),
    false,
  );
});

test("canViewWork: hidden only for its author or moderators", () => {
  const hidden = { visibility: "public", userId: 3, hiddenAt: new Date() };
  assert.equal(canViewWork(hidden, { id: 3, role: "member" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "mod" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "admin" }), true);
  assert.equal(canViewWork(hidden, { id: 9, role: "member" }), false);
  assert.equal(canViewWork(hidden, null), false);
});
