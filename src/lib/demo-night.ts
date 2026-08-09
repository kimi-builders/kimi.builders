/* Demo Night v0(实施计划第三步,P3 提前):线上报名 + 归档页。
   核心语义(战略支柱 1):到场名单公开 —— 报名即同意把 handle 署进该场到场名单,
   名单按报名时间正序(先到场先署名);身体一次只能在一个地方,到场本身就是稀缺背书。
   v0 运维方式:demo_events 的创建、改状态(upcoming → done)、回填回放链接一律
   直接 SQL 维护,不建站内后台;文件末尾的 createDemoEvent / setDemoEventStatus /
   setDemoEventStreamUrl 是给未来后台预留的写函数,当前只有迁移与手工 SQL 在写表。
   starts_at 按 UTC 存储与展示(页面标注 UTC),v0 不做时区换算。
   结构对齐 ./featured:纯查询构建在上半(单测直接测),DB 读写在下半组装。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export type DemoEventStatus = "upcoming" | "done";

export interface DemoEvent {
  id: number;
  title: string;
  startsAt: Date;
  description: string; // Markdown 短文本
  locationNote: string; // 如「线上 · 会议链接报名后可见」
  streamUrl: string | null; // NULL=未公开
  status: DemoEventStatus;
}

/* 归档列表条目:事件 + 到场人数。 */
export interface ArchivedDemoEvent extends DemoEvent {
  rsvpCount: number;
}

/* 到场名单条目:联 users 取署名所需的最小字段。 */
export interface RosterEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  rsvpAt: Date;
}

/* 当前场汇总:右栏 widget 与页面头部共用。 */
export interface UpcomingSummary {
  event: DemoEvent;
  rsvpCount: number;
  rsvped: boolean; // 当前用户是否已报名(未登录恒 false)
}

/* 当前场:upcoming 中取开场时间最近的一场(同一时间取 id 小者,确定性)。 */
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

/* 归档:done 场次按开场时间倒序;到场人数随行子查询(v0 场次少,不建冗余计数列)。 */
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

/* 单场到场名单:按报名时间正序 —— 先到场先署名(同秒按 user_id 定序)。 */
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

/* 归档头像墙:一次取多场名单(避免 N+1),行序即署名序,按 event_id 分组在 JS。 */
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

/* 报名:INSERT IGNORE 幂等(复合主键去重,重复报名不报错、不重复署名);
   SELECT ... WHERE status='upcoming' 把「只能报当前场」钉死在 SQL 侧,
   已归档场次即便被构造请求也写不进名单。affectedRows=1 才是新署名。 */
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

/* 取消报名:物理删除(无软删),名单只反映当前在场的人;幂等,不存在即 false。 */
export function cancelRsvpQuery(eventId: number, userId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `DELETE FROM demo_rsvps WHERE event_id = ? AND user_id = ?`,
    args: [eventId, userId],
  };
}

/* ---- 展示格式化(UTC 原样输出,确定性,单测直接测)---- */

const pad2 = (n: number) => String(n).padStart(2, "0");

/* 「2026-08-22 13:00 UTC」:当前场需要精确到分钟。 */
export function formatEventTime(d: Date): string {
  return `${formatEventDate(d)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

/* 「2026-08-22」:归档列表只到日。 */
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

/* 多场名单行 → event_id 分组;行序(报名时间正序)在组内保持。 */
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

/* ---- DB 读 ---- */

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

/* 归档头像墙批量取数;空列表短路(不拼 IN ())。 */
export async function getEventRosters(
  eventIds: number[],
): Promise<Map<number, RosterEntry[]>> {
  if (eventIds.length === 0) return new Map();
  const q = rostersForEventsQuery(eventIds);
  const [rows] = await getPool().query<RowDataPacket[]>(q.sql, q.args);
  return groupRosterRows(rows);
}

/* 当前场 + 人数 + 当前用户报名态:未登录传 null(mine 恒 0)。 */
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

/* ---- 写(RSVP 的鉴权在 action 层:必须登录;幂等性见 rsvpQuery 注释)---- */

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

/* ---- 场次运维写函数(v0 无站内 UI:创建/改状态/回填回放直接 SQL;
   以下留给未来的后台界面调用,当前不在任何路由里接线)---- */

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
