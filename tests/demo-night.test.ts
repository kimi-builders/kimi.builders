import assert from "node:assert/strict";
import test from "node:test";
import type { RowDataPacket } from "mysql2";
import {
  archivedEventsQuery,
  cancelRsvpQuery,
  eventRosterQuery,
  formatEventDate,
  formatEventTime,
  groupRosterRows,
  rostersForEventsQuery,
  rsvpQuery,
  upcomingEventQuery,
} from "../src/lib/demo-night";

test("upcoming query picks the nearest upcoming event, deterministically", () => {
  const { sql, args } = upcomingEventQuery();
  assert.match(sql, /WHERE e\.status = 'upcoming'/);
  /* 最近一场:开场时间正序取第一;同刻按 id 定序,结果确定 */
  assert.match(sql, /ORDER BY e\.starts_at ASC, e\.id ASC LIMIT 1/);
  assert.deepEqual(args, []);
});

test("archive query lists done events newest first with an inline attendee count", () => {
  const { sql, args } = archivedEventsQuery(10);
  assert.match(sql, /WHERE e\.status = 'done'/);
  assert.match(sql, /ORDER BY e\.starts_at DESC, e\.id DESC LIMIT \?/);
  /* 到场人数随行子查询:归档卡片直接渲染,不二次查库 */
  assert.match(sql, /SELECT COUNT\(\*\) FROM demo_rsvps r WHERE r\.event_id = e\.id/);
  assert.deepEqual(args, [10]);
});

test("roster query joins users and signs first-come-first (created_at asc)", () => {
  const { sql, args } = eventRosterQuery(7);
  assert.match(sql, /FROM demo_rsvps r/);
  assert.match(sql, /JOIN users u ON u\.id = r\.user_id/);
  assert.match(sql, /WHERE r\.event_id = \?/);
  /* 先到场先署名:报名时间正序,同秒按 user_id 定序 */
  assert.match(sql, /ORDER BY r\.created_at ASC, r\.user_id ASC/);
  assert.deepEqual(args, [7]);
});

test("batch roster query covers many events in one roundtrip, ordered for grouping", () => {
  const { sql, args } = rostersForEventsQuery([3, 1, 2]);
  assert.match(sql, /WHERE r\.event_id IN \(\?,\?,\?\)/);
  assert.match(sql, /ORDER BY r\.event_id ASC, r\.created_at ASC, r\.user_id ASC/);
  assert.deepEqual(args, [3, 1, 2]);
});

test("rsvp is idempotent and pinned to the upcoming event in SQL", () => {
  const { sql, args } = rsvpQuery(42, 9);
  /* 幂等:复合主键 + INSERT IGNORE —— 重复报名不报错、不重复署名 */
  assert.match(sql, /INSERT IGNORE INTO demo_rsvps \(event_id, user_id\)/);
  /* 「只能报当前场」钉在 SQL 侧:已归档/不存在的场次写不进名单 */
  assert.match(sql, /SELECT e\.id, \? FROM demo_events e/);
  assert.match(sql, /WHERE e\.id = \? AND e\.status = 'upcoming'/);
  assert.deepEqual(args, [9, 42]);
});

test("cancel rsvp deletes exactly the (event, user) pair", () => {
  const { sql, args } = cancelRsvpQuery(42, 9);
  assert.match(sql, /DELETE FROM demo_rsvps WHERE event_id = \? AND user_id = \?/);
  assert.deepEqual(args, [42, 9]);
});

test("groupRosterRows groups by event and keeps first-come-first order inside each group", () => {
  const row = (eventId: number, handle: string, at: string) =>
    ({
      event_id: eventId,
      rsvp_at: new Date(at),
      handle,
      name: "",
      avatar_url: "",
    }) as unknown as RowDataPacket;
  const grouped = groupRosterRows([
    row(1, "a", "2026-08-20T13:00:00Z"),
    row(2, "x", "2026-08-20T13:01:00Z"),
    row(1, "b", "2026-08-20T13:02:00Z"),
  ]);
  assert.deepEqual(
    [...grouped.keys()].sort(),
    [1, 2],
  );
  assert.deepEqual(
    grouped.get(1)?.map((r) => r.handle),
    ["a", "b"],
  );
  assert.deepEqual(
    grouped.get(2)?.map((r) => r.handle),
    ["x"],
  );
});

test("event time formatting is deterministic UTC (page labels it as UTC)", () => {
  const d = new Date("2026-08-22T13:05:00Z");
  assert.equal(formatEventTime(d), "2026-08-22 13:05 UTC");
  assert.equal(formatEventDate(d), "2026-08-22");
  assert.equal(formatEventDate(new Date("2026-01-02T00:00:00Z")), "2026-01-02");
});
