import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("analytics beacon route pins same-origin, bot filtering, whitelist, and silent limiter", () => {
  const route = source("app/api/analytics/event/route.ts");
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /isAnalyticsBot\(request\.headers\.get\("user-agent"\)\)/);
  assert.match(route, /parseAnalyticsEventPayload\(input\)/);
  assert.match(route, /BEACON_EVENT_SET\.has\(payload\.event\)/);
  assert.match(route, /consumeUsageRateLimit\(\{/);
  assert.match(route, /scope: "analytics-event"/);
  assert.match(route, /limit: 60/);
  assert.match(route, /windowSeconds: 10 \* 60/);
  assert.match(route, /if \(!allowed\) return empty\(\)/);
  assert.match(route, /readAnalyticsJson/);
  assert.match(route, /return empty\(400\)/);
  assert.match(route, /return empty\(\)/);
  assert.doesNotMatch(route, /await request\.json\(\)/);
  assert.ok(
    route.indexOf('if (isAnalyticsBot(request.headers.get("user-agent")))') <
      route.indexOf("input = await readAnalyticsJson(request)"),
  );
  assert.ok(
    route.indexOf("await consumeUsageRateLimit({") <
      route.indexOf("input = await readAnalyticsJson(request)"),
  );
  assert.ok(
    route.indexOf("input = await readAnalyticsJson(request)") <
      route.indexOf("const payload = parseAnalyticsEventPayload(input)"),
  );
});

test("analytics storage and API body contain no persistent sensitive identity fields", () => {
  const migration = source("db/migrations/20260903_analytics_events.sql");
  const analytics = source("src/lib/analytics.ts");
  const route = source("app/api/analytics/event/route.ts");
  const columns = migration
    .split("CREATE TABLE IF NOT EXISTS analytics_events (")[1]
    ?.split(");")[0]
    .toLowerCase() ?? "";
  for (const forbidden of ["user_id", "url", "referrer", "ip", "user-agent", "user_agent"]) {
    assert.ok(!columns.includes(forbidden), `unexpected analytics column: ${forbidden}`);
  }
  assert.match(analytics, /const BODY_KEYS = new Set\(\["event", "target_kind", "target_id", "meta"\]\)/);
  assert.ok(!route.includes("request.headers.get(\"referer\")"));
});

test("analytics view tracking stays out of all shared data-cache callbacks", () => {
  for (const path of [
    "src/lib/home.ts",
    "src/lib/public-works-cache.ts",
    "src/lib/public-rails-cache.ts",
    "src/lib/usage/public-leaderboard-cache.ts",
    "app/(app)/works/_components/works-page.tsx",
  ]) {
    assert.doesNotMatch(source(path), /trackEvent\(/, path);
  }
});

test("every requested server page owns its view event in the page component", () => {
  const expected = [
    ["app/page.tsx", "home_view"],
    ["app/(app)/usage/leaderboard/page.tsx", "leaderboard_view"],
    ["app/(app)/awesome/page.tsx", "awesome_view"],
    ["app/(app)/works/page.tsx", "works_view"],
    ["app/(app)/usage/page.tsx", "usage_view"],
    ["app/(app)/community/[id]/page.tsx", "post_view"],
    ["app/(app)/works/[id]/page.tsx", "work_view"],
    ["app/(app)/u/[handle]/page.tsx", "profile_view"],
    ["app/(app)/u/[handle]/page.tsx", "profile_tab_view"],
  ] as const;
  for (const [path, event] of expected) {
    const page = source(path);
    assert.match(page, new RegExp(`trackEvent\\(\\s*["']${event}["']`), `${path}: ${event}`);
    assert.match(page, /await headers\(\)/, path);
  }

  const post = source("app/(app)/community/[id]/page.tsx");
  assert.ok(post.indexOf('if (!post) notFound()') < post.indexOf('trackEvent("post_view"'));
  assert.ok(post.indexOf('if (!canViewPost(post, user)) notFound()') < post.indexOf('trackEvent("post_view"'));
  const work = source("app/(app)/works/[id]/page.tsx");
  assert.ok(work.indexOf("if (!work || !canViewWork(work, user))") < work.indexOf('trackEvent("work_view"'));
  const profile = source("app/(app)/u/[handle]/page.tsx");
  assert.ok(profile.indexOf("if (!profile)") < profile.indexOf('"profile_view"'));
  assert.ok(profile.indexOf("const activeTab") < profile.indexOf('"profile_tab_view"'));
  assert.match(profile, /\{ tab: activeTab \}/);
});

test("all requested click surfaces send only fixed beacon payloads", () => {
  const client = source("app/(app)/_components/track.tsx");
  assert.match(client, /navigator\.sendBeacon/);
  assert.match(client, /keepalive: true/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /new Blob\(\[body\], \{ type: "application\/json" \}\)/);
  assert.doesNotMatch(client, /window\.location|document\.referrer|user_id|x-forwarded-for/i);

  const home = source("app/page.tsx");
  assert.match(home, /event: "featured_click"[\s\S]*position: "home"/);
  for (const slot of ["discussions", "awesome", "mail"]) {
    assert.match(home, new RegExp(`event: "join_click"[\\s\\S]*target_id: "${slot}"`));
  }
  assert.match(
    source("app/(app)/_components/rail/CommunityWidgets.tsx"),
    /event: "featured_click"[\s\S]*position: "rail"/,
  );
  assert.match(
    source("app/(app)/u/[handle]/page.tsx"),
    /event: "poster_download"[\s\S]*target_id: "profile"/,
  );
  assert.match(source("components/ShareButton.tsx"), /event: "poster_download"/);
  assert.match(
    source("app/(app)/community/[id]/page.tsx"),
    /posterSurface=\{post\.visibility === "public" \? "post" : undefined\}/,
  );
  assert.match(
    source("app/(app)/works/[id]/page.tsx"),
    /posterSurface=\{work\.visibility === "public" \? "work" : undefined\}/,
  );
  assert.match(
    source("app/(app)/usage/_components/UsageShareDialog.tsx"),
    /function downloadPoster\(\)[\s\S]*event: "poster_download"[\s\S]*target_id: "usage"/,
  );
});

test("analytics retention cron uses bearer auth and the 90-day delete helper", () => {
  const route = source("app/api/cron/analytics-retention/route.ts");
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /`Bearer \$\{secret\}`/);
  assert.match(route, /applyAnalyticsRetention\(\)/);
  assert.match(
    source("src/lib/analytics.ts"),
    /DELETE FROM usage_rate_limits WHERE scope = 'analytics-event'/,
  );
  assert.doesNotMatch(source("app/api/cron/usage-retention/route.ts"), /analytics/i);
});
