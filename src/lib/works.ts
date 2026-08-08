/* 作品库:社区成员用 Kimi 构建的真实作品(works 表,source=site;
   source=awesome 是 awesome 仓库导入的外部条目,展示用 author_label)。
   作者自助增改删,归属校验钉在 SQL WHERE 里(同帖子)。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface WorkRow {
  id: number;
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
  source: string;
  createdAt: Date;
  /* 站内作者(user_id 空 = awesome 外部条目,用 authorLabel) */
  userId: number | null;
  handle: string | null;
  avatarUrl: string | null;
  authorLabel: string;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapWork(r: RowDataPacket): WorkRow {
  return {
    id: Number(r.id),
    name: r.name,
    tagline: r.tagline,
    url: r.url,
    repoUrl: r.repo_url,
    screenshotUrl: r.screenshot_url,
    tags: parseTags(r.tags),
    source: r.source,
    createdAt: r.created_at,
    userId: r.user_id === null ? null : Number(r.user_id),
    handle: r.handle ?? null,
    avatarUrl: r.avatar_url ?? null,
    authorLabel: r.author_label,
  };
}

export async function getWorks(): Promise<WorkRow[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.id, w.user_id, w.name, w.tagline, w.url, w.repo_url,
            w.screenshot_url, w.tags, w.source, w.author_label, w.created_at,
            u.handle, u.avatar_url
     FROM works w LEFT JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC LIMIT 100`,
  );
  return rows.map(mapWork);
}

export async function getWork(id: number): Promise<WorkRow | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT w.id, w.user_id, w.name, w.tagline, w.url, w.repo_url,
            w.screenshot_url, w.tags, w.source, w.author_label, w.created_at,
            u.handle, u.avatar_url
     FROM works w LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapWork(rows[0]) : null;
}

export interface WorkFields {
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
}

export async function createWork(
  userId: number,
  f: WorkFields,
): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    `INSERT INTO works (user_id, name, tagline, url, repo_url, screenshot_url, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
    ],
  );
  return Number(res.insertId);
}

export async function updateWork(
  userId: number,
  workId: number,
  f: WorkFields,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE works SET name = ?, tagline = ?, url = ?, repo_url = ?, screenshot_url = ?, tags = ?
     WHERE id = ? AND user_id = ?`,
    [
      f.name.slice(0, 120),
      f.tagline.slice(0, 300),
      f.url.slice(0, 500),
      f.repoUrl.slice(0, 500),
      f.screenshotUrl.slice(0, 500),
      JSON.stringify(f.tags.slice(0, 5)),
      workId,
      userId,
    ],
  );
  return res.affectedRows > 0;
}

export async function deleteWork(
  userId: number,
  workId: number,
): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM works WHERE id = ? AND user_id = ?",
    [workId, userId],
  );
  return res.affectedRows > 0;
}
