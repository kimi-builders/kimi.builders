/* Demo Night v0: online RSVP + archive pages. Core semantics (strategic
   pillar 1): the attendance list is public — signing up consents to your
   handle being credited on that event's list, ordered by signup time
   (first to arrive, first credited); you can only be in one place at a
   time, so attendance is inherently scarce endorsement. v0 operations:
   creating demo_events, changing status (upcoming -> done), and
   backfilling stream links all happen via direct SQL — no in-site admin;
   createDemoEvent / setDemoEventStatus / setDemoEventStreamUrl at the
   bottom are write functions reserved for a future console; today only
   migrations and hand-run SQL write the table. starts_at is stored and
   shown in UTC (labeled on the page); v0 does no timezone conversion.
   Structure aligned with ./featured: pure query builders on top
   (unit-tested), DB assembly below. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export type DemoEventStatus = "upcoming" | "done";

export interface DemoEvent {
  id: number;
  title: string;
  startsAt: Date;
  description: string; // short Markdown
  locationNote: string; // e.g. "online · meeting link revealed after
                         // RSVP"
  streamUrl: string | null; // NULL = not public yet
  status: DemoEventStatus;
}

/* Archive list entry: an event + its attendance count. */
export interface ArchivedDemoEvent extends DemoEvent {
  rsvpCount: number;
}

/* Attendance entry: the minimal users join for credit display. */
export interface RosterEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  rsvpAt: Date;
}

/* Current-event summary: shared by the rail widget and the page
   header. */
export interface UpcomingSummary {
  event: DemoEvent;
  rsvpCount: number;
  rsvped: boolean; // whether the current user RSVPed (always false when
                    // signed out)
}

/* Current event: the upcoming event starting soonest (lowest id on
   ties, deterministic). */
export function upcomingEventQuery(): { sql: string; args: number[] } {
  return {
    sql: `SELECT e.id, e.title, e.starts_at, e.description, e.location_note,
                 e.stream_url, e.status
          FROM demo_events e
          WHERE e.status = 'upcoming'
          ORDER BY e.starts_at ASC, e.id ASC LIMIT 1`,
    args: [],
  };
}

/* Archive: done events by start time desc; attendance count rides
   along as a subquery (few events in v0, no redundant counter column). */
export function archivedEventsQuery(limit: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT e.id, e.title, e.starts_at, e.description, e.location_note,
                 e.stream_url, e.status,
                 (SELECT COUNT(*) FROM demo_rsvps r WHERE r.event_id = e.id) AS rsvp_count
          FROM demo_events e
          WHERE e.status = 'done'
          ORDER BY e.starts_at DESC, e.id DESC LIMIT ?`,
    args: [limit],
  };
}

/* One event's attendance: signup-time ascending — first to arrive,
   first credited (user_id breaks same-second ties). */
export function eventRosterQuery(eventId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT r.created_at AS rsvp_at, u.handle, u.name, u.avatar_url
          FROM demo_rsvps r
          JOIN users u ON u.id = r.user_id
          WHERE r.event_id = ?
          ORDER BY r.created_at ASC, r.user_id ASC`,
    args: [eventId],
  };
}

/* Archive avatar wall: many events' lists in one query (no N+1); row
   order is credit order, grouped by event_id in JS. */
export function rostersForEventsQuery(eventIds: number[]): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT r.event_id, r.created_at AS rsvp_at, u.handle, u.name, u.avatar_url
          FROM demo_rsvps r
          JOIN users u ON u.id = r.user_id
          WHERE r.event_id IN (${eventIds.map(() => "?").join(",")})
          ORDER BY r.event_id ASC, r.created_at ASC, r.user_id ASC`,
    args: [...eventIds],
  };
}

/* RSVP: INSERT IGNORE is idempotent (composite PK dedupes; repeat
   signups neither error nor double-credit); SELECT ... WHERE
   status='upcoming' pins "only the current event" in SQL — archived
   events reject even crafted requests. affectedRows=1 marks a new
   credit. */
export function rsvpQuery(eventId: number, userId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `INSERT IGNORE INTO demo_rsvps (event_id, user_id)
          SELECT e.id, ? FROM demo_events e
          WHERE e.id = ? AND e.status = 'upcoming'`,
    args: [userId, eventId],
  };
}

/* Cancel RSVP: physical delete (no soft delete) — the list reflects who
   is in now; idempotent, missing rows return false. */
export function cancelRsvpQuery(eventId: number, userId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `DELETE FROM demo_rsvps WHERE event_id = ? AND user_id = ?`,
    args: [eventId, userId],
  };
}

/* ---- Display formatting (UTC as-is, deterministic, unit-tested)
   ---- */

const pad2 = (n: number) => String(n).padStart(2, "0");

/* "2026-08-22 13:00 UTC": the current event needs minute precision. */
export function formatEventTime(d: Date): string {
  return `${formatEventDate(d)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

/* "2026-08-22": the archive list stops at the day. */
export function formatEventDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function mapDemoEvent(r: RowDataPacket): DemoEvent {
  return {
    id: Number(r.id),
    title: r.title,
    startsAt: r.starts_at,
    description: r.description ?? "",
    locationNote: r.location_note ?? "",
    streamUrl: r.stream_url ?? null,
    status: r.status === "done" ? "done" : "upcoming",
  };
}

function mapRosterRow(r: RowDataPacket): RosterEntry {
  return {
    handle: r.handle,
    name: r.name ?? "",
    avatarUrl: r.avatar_url ?? "",
    rsvpAt: r.rsvp_at,
  };
}

/* Many events' rows -> grouped by event_id; row order (signup
   ascending) is preserved within groups. */
export function groupRosterRows(rows: RowDataPacket[]): Map<number, RosterEntry[]> {
  const map = new Map<number, RosterEntry[]>();
  for (const r of rows) {
    const eventId = Number(r.event_id);
    const list = map.get(eventId);
    const entry = mapRosterRow(r);
    if (list) list.push(entry);
    else map.set(eventId, [entry]);
  }
  return map;
}

/* ---- DB reads ---- */

export async function getUpcomingEvent(): Promise<DemoEvent | null> {
  const q = upcomingEventQuery();
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows[0] ? mapDemoEvent(rows[0]) : null;
}

export async function getArchivedEvents(limit = 20): Promise<ArchivedDemoEvent[]> {
  const q = archivedEventsQuery(limit);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map((r) => ({ ...mapDemoEvent(r), rsvpCount: Number(r.rsvp_count) }));
}

export async function getEventRoster(eventId: number): Promise<RosterEntry[]> {
  const q = eventRosterQuery(eventId);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return rows.map(mapRosterRow);
}

/* Batch fetch for the archive avatar wall; empty lists short-circuit
   (never build IN ()). */
export async function getEventRosters(
  eventIds: number[],
): Promise<Map<number, RosterEntry[]>> {
  if (eventIds.length === 0) return new Map();
  const q = rostersForEventsQuery(eventIds);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return groupRosterRows(rows);
}

/* Current event + count + the current user's RSVP state: pass null
   when signed out (mine stays 0). */
export async function getUpcomingSummary(
  userId: number | null,
): Promise<UpcomingSummary | null> {
  const event = await getUpcomingEvent();
  if (!event) return null;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n,
            MAX(r.user_id = ?) AS mine
     FROM demo_rsvps r WHERE r.event_id = ?`,
    [userId ?? 0, event.id],
  );
  return {
    event,
    rsvpCount: Number(rows[0]?.n ?? 0),
    rsvped: !!rows[0]?.mine,
  };
}

/* ---- Writes (RSVP auth lives in the action layer: login required;
   idempotency per the rsvpQuery comment) ---- */

export async function rsvp(eventId: number, userId: number): Promise<boolean> {
  const q = rsvpQuery(eventId, userId);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}

export async function cancelRsvp(
  eventId: number,
  userId: number,
): Promise<boolean> {
  const q = cancelRsvpQuery(eventId, userId);
  const [res] = await getPool().query<ResultSetHeader>(q.sql, q.args);
  return res.affectedRows > 0;
}

/* ---- Event ops writes (v0 has no in-site UI: create/status/stream
   backfill via direct SQL; the following await a future console and are
   wired to no route today) ---- */

export interface DemoEventInput {
  title: string;
  startsAt: Date;
  description?: string;
  locationNote?: string;
}

export async function createDemoEvent(input: DemoEventInput): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO demo_events (title, starts_at, description, location_note)
     VALUES (?, ?, ?, ?)`,
    [
      input.title,
      input.startsAt,
      input.description ?? "",
      input.locationNote ?? "",
    ],
  );
  return Number(res.insertId);
}

export async function setDemoEventStatus(
  eventId: number,
  status: DemoEventStatus,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE demo_events SET status = ? WHERE id = ?`,
    [status, eventId],
  );
  return res.affectedRows > 0;
}

export async function setDemoEventStreamUrl(
  eventId: number,
  streamUrl: string | null,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE demo_events SET stream_url = ? WHERE id = ?`,
    [streamUrl, eventId],
  );
  return res.affectedRows > 0;
}
