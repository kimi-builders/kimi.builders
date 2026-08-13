import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnalyticsBot,
  parseAnalyticsEventPayload,
  viewerHash,
} from "../src/lib/analytics";

const LEGAL = [
  { event: "home_view", target_kind: "page", target_id: "home" },
  { event: "leaderboard_view", target_kind: "page", target_id: "leaderboard" },
  { event: "awesome_view", target_kind: "page", target_id: "awesome" },
  { event: "works_view", target_kind: "page", target_id: "works" },
  { event: "usage_view", target_kind: "page", target_id: "usage" },
  { event: "post_view", target_kind: "post", target_id: "42" },
  { event: "work_view", target_kind: "work", target_id: "7" },
  { event: "profile_view", target_kind: "profile", target_id: "builder_01" },
  {
    event: "profile_tab_view",
    target_kind: "profile",
    target_id: "builder_01",
    meta: { tab: "works" },
  },
  {
    event: "featured_click",
    target_kind: "post",
    target_id: "42",
    meta: { position: "home" },
  },
  {
    event: "featured_click",
    target_kind: "work",
    target_id: "7",
    meta: { position: "rail" },
  },
  {
    event: "poster_download",
    target_kind: "surface",
    target_id: "profile",
    meta: { surface: "profile" },
  },
  {
    event: "join_click",
    target_kind: "slot",
    target_id: "discussions",
    meta: { slot: "discussions" },
  },
] as const;

test("analytics taxonomy accepts every legal v1 event shape", () => {
  for (const payload of LEGAL) {
    assert.ok(parseAnalyticsEventPayload(payload), payload.event);
  }
});

test("analytics taxonomy rejects unknown events, target combinations, and ids", () => {
  const invalid = [
    { event: "made_up", target_kind: "page", target_id: "home" },
    { event: "home_view", target_kind: "post", target_id: "home" },
    { event: "home_view", target_kind: "page", target_id: "usage" },
    { event: "post_view", target_kind: "post", target_id: "0" },
    { event: "post_view", target_kind: "post", target_id: "1-or-2" },
    { event: "profile_view", target_kind: "profile", target_id: "Bad Handle" },
    { event: "work_view", target_kind: "work", target_id: `1${"0".repeat(64)}` },
    null,
    [],
  ];
  for (const payload of invalid) assert.equal(parseAnalyticsEventPayload(payload), null);
  assert.ok(
    parseAnalyticsEventPayload({
      event: "work_view",
      target_kind: "work",
      target_id: `1${"0".repeat(63)}`,
    }),
    "64-character numeric target id is the accepted boundary",
  );
});

test("analytics meta uses exact keys, values, and target agreement", () => {
  const invalid = [
    { event: "home_view", target_kind: "page", target_id: "home", meta: {} },
    { event: "profile_tab_view", target_kind: "profile", target_id: "ada" },
    {
      event: "profile_tab_view",
      target_kind: "profile",
      target_id: "ada",
      meta: { tab: "secrets" },
    },
    {
      event: "featured_click",
      target_kind: "post",
      target_id: "1",
      meta: { position: "home", extra: "rail" },
    },
    {
      event: "featured_click",
      target_kind: "post",
      target_id: "1",
      meta: { position: "x".repeat(33) },
    },
    {
      event: "poster_download",
      target_kind: "surface",
      target_id: "post",
      meta: { surface: "work" },
    },
    {
      event: "join_click",
      target_kind: "slot",
      target_id: "mail",
      meta: { slot: "awesome" },
    },
  ];
  for (const payload of invalid) assert.equal(parseAnalyticsEventPayload(payload), null);
});

test("analytics payload rejects unexpected and privacy-sensitive root fields", () => {
  for (const key of ["user_id", "url", "referrer", "ip", "user_agent"]) {
    assert.equal(
      parseAnalyticsEventPayload({
        event: "featured_click",
        target_kind: "post",
        target_id: "1",
        meta: { position: "home" },
        [key]: "do-not-store",
      }),
      null,
      key,
    );
  }
});

test("viewer hash is stable within a UTC day, rotates across days, and hides inputs", () => {
  const request = new Request("https://kimi.builders/anything?not=stored", {
    headers: {
      "x-forwarded-for": "203.0.113.42, 10.0.0.2",
      "user-agent": "Private Browser/9.1",
      referer: "https://elsewhere.example/private-path",
    },
  });
  const sameDayA = viewerHash(request, new Date("2026-09-03T00:00:00.000Z"), "test-secret");
  const sameDayB = viewerHash(request, new Date("2026-09-03T23:59:59.999Z"), "test-secret");
  const nextDay = viewerHash(request, new Date("2026-09-04T00:00:00.000Z"), "test-secret");
  assert.equal(sameDayA, sameDayB);
  assert.notEqual(sameDayA, nextDay);
  assert.match(sameDayA, /^[a-f0-9]{64}$/);
  assert.ok(!sameDayA.includes("203.0.113.42"));
  assert.ok(!sameDayA.includes("Private Browser"));
  assert.equal(
    sameDayA,
    viewerHash(
      new Request("https://different.example/", {
        headers: {
          "x-forwarded-for": "203.0.113.42",
          "user-agent": "Private Browser/9.1",
          referer: "https://another.example/",
        },
      }),
      new Date("2026-09-03T12:00:00.000Z"),
      "test-secret",
    ),
    "URL and referrer do not influence the identity",
  );
});

test("viewer hash uses the first forwarded IP and anon fallbacks", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const first = viewerHash(
    new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1", "user-agent": "ua" }),
    now,
    "secret",
  );
  const direct = viewerHash(
    new Headers({ "x-forwarded-for": "203.0.113.1", "user-agent": "ua" }),
    now,
    "secret",
  );
  assert.equal(first, direct);
  assert.match(viewerHash(new Headers(), now, "secret"), /^[a-f0-9]{64}$/);
});

test("analytics bot filter covers common crawlers and leaves browsers alone", () => {
  for (const ua of ["Googlebot/2.1", "bingbot", "Baiduspider", "curl/8", "HeadlessChrome"]) {
    assert.equal(isAnalyticsBot(ua), true, ua);
  }
  assert.equal(isAnalyticsBot("Mozilla/5.0 Safari/605.1.15"), false);
  assert.equal(isAnalyticsBot(null), false);
});
