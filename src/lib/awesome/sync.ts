import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { canonical, digest, validateCatalog, type Catalog, type Entry } from './catalog.mjs';
import { getPool } from '../db';
export interface Binding {entryId: string; workId: number; expectedUrl: string}
export type Change = {entryId: string; workId: number | null; action: 'create'|'update'|'bind'|'withdraw'|'unchanged'|'conflict'; reason?: string; before?: Before; after?: Before};
interface Before { mapping: Mapping | null; fields: Fields | null }
interface Mapping {entry_id: string; work_id: number | null; ownership: string; publication: string; entry_json: Entry; content_hash: string; applied_fields: Fields | null; source_revision: string}
type Fields = Record<string, string | null>;
export interface SyncResult {runId: number; revision: string; dryRun: boolean; changes: Change[]; counts: Record<string,number>; cachePending: boolean}
const COLUMNS = ['name','tagline','url','repo_url','author_label','agents','kind','scope','description_md'] as const;
const LOCK = 'kimi-builders:awesome-v1';
const json = <T>(v: unknown): T => typeof v === 'string' ? JSON.parse(v) : v as T;
const urlKey = (v: string) => v.toLowerCase().replace(/\.git$/,'').replace(/\/$/,'');
function fieldsOf(row: RowDataPacket): Fields {
  return Object.fromEntries(COLUMNS.map(k => [k,k === 'agents' ? canonical(json(row[k] ?? [])) : row[k] ?? null]));
}
export function projectedFields(e: Entry): Fields {
  return {name:e.name,tagline:e.descriptionZh,url:e.homepage ?? e.url,repo_url:e.repoUrl ?? (e.url.startsWith('https://github.com/') ? e.url : ''),author_label:e.author?.name ?? '',agents:canonical(e.agents),kind:e.kind ?? 'other',scope:e.scope ?? null,description_md:e.bodyZh ?? null};
}
function mapRow(row: RowDataPacket | undefined): Mapping | null {
  if (!row) return null;
  return {entry_id:row.entry_id,work_id:row.work_id===null ? null : Number(row.work_id),ownership:row.ownership,publication:row.publication,entry_json:json(row.entry_json),content_hash:row.content_hash,applied_fields:json(row.applied_fields),source_revision:row.source_revision};
}
export function validateBindings(raw: unknown): Binding[] {
  if (!Array.isArray(raw) || raw.length > 2000) throw new Error('invalid_bindings');
  const ids = new Set(),works = new Set();
  for (const b of raw) {
    if (!b || typeof b !== 'object' || Object.keys(b).sort().join(',') !== 'entryId,expectedUrl,workId' || typeof b.entryId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.entryId) || !Number.isSafeInteger(b.workId) || b.workId < 1 || typeof b.expectedUrl !== 'string' || !b.expectedUrl.startsWith('https://') || ids.has(b.entryId) || works.has(b.workId)) throw new Error('invalid_bindings');
    ids.add(b.entryId);works.add(b.workId);
  }
  return raw;
}
async function writeFields(conn: PoolConnection, id: number, fields: Fields) {
  await conn.query(`UPDATE works SET ${COLUMNS.map(k => `${k} = ?`).join(',')} WHERE id = ?`,[...COLUMNS.map(k => fields[k]),id]);
}
async function saveMapping(conn: PoolConnection,m: Mapping) {
  await conn.query(`INSERT INTO awesome_entries (entry_id,work_id,ownership,publication,entry_json,content_hash,applied_fields,source_revision)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE publication=VALUES(publication),entry_json=VALUES(entry_json),content_hash=VALUES(content_hash),applied_fields=VALUES(applied_fields),source_revision=VALUES(source_revision)`,
    [m.entry_id,m.work_id,m.ownership,m.publication,JSON.stringify(m.entry_json),m.content_hash,m.applied_fields ? JSON.stringify(m.applied_fields) : null,m.source_revision]);
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return ['sync_busy','sync_conflict','invalid_snapshot','invalid_bindings','invalid_revision','rollback_conflict','rollback_not_found'].includes(message) ? message : 'sync_failed';
}
async function locked<T>(pool: Pool,fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c=await pool.getConnection();let acquired=false;
  try { const [rows]=await c.query<RowDataPacket[]>('SELECT GET_LOCK(?,0) AS acquired',[LOCK]);acquired=Number(rows[0].acquired)===1;if (!acquired) throw new Error('sync_busy');return await fn(c); }
  finally { try { if (acquired) await c.query('SELECT RELEASE_LOCK(?)',[LOCK]); } finally { c.release(); } }
}
export async function syncCatalog(input: Catalog,revision: string,options: {dryRun?: boolean; bindings?: Binding[]; pool?: Pool} = {}): Promise<SyncResult> {
  const catalog=validateCatalog(input);if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('invalid_revision');
  const bindings=validateBindings(options.bindings ?? []);const pool=options.pool ?? getPool();
  return locked(pool,async c => {
    const [run]=await c.query<ResultSetHeader>(`INSERT INTO awesome_sync_runs (action,source_revision,snapshot_hash,status) VALUES (?,?,?,'running')`,[options.dryRun ? 'dry-run' : 'sync',revision,catalog.digest]);
    const changes: Change[]=[];const counts: Record<string,number>={create:0,update:0,bind:0,withdraw:0,unchanged:0,conflict:0};
    const result: SyncResult={runId:run.insertId,revision,dryRun:!!options.dryRun,changes,counts,cachePending:false};
    try {
      await c.beginTransaction();
      for (const entry of catalog.entries) {
        const [mr]=await c.query<RowDataPacket[]>('SELECT * FROM awesome_entries WHERE entry_id=? FOR UPDATE',[entry.id]);const previous=mapRow(mr[0]);
        const binding=bindings.find(b => b.entryId===entry.id);
        let workId=previous?.work_id ?? binding?.workId ?? null;
        const change: Change={entryId:entry.id,workId,action:'unchanged'};
        const hash=digest(entry);let row: RowDataPacket | undefined;
        if (workId) { const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM works WHERE id=? FOR UPDATE',[workId]);row=rows[0]; }
        if (previous && !workId && entry.publication !== 'withdrawn') {change.action='conflict';change.reason='mapped_work_missing';}
        else if (workId && !row) {change.action='conflict';change.reason='mapped_work_missing';}
        else if (!previous && binding && row && ![row.repo_url,row.url].some(v => urlKey(v)===urlKey(binding.expectedUrl))) {change.action='conflict';change.reason='binding_identity_changed';}
        else if (row && previous?.ownership==='external' && (row.source !== 'awesome' || !previous.applied_fields || canonical(fieldsOf(row))!==canonical(previous.applied_fields))) {change.action='conflict';change.reason='manual_override';}
        else if (previous && previous.content_hash===hash && previous.publication===entry.publication) {change.action='unchanged';}
        else if (!previous && !binding && entry.publication==='withdrawn') {change.action='unchanged';}
        else {
          if (!workId && entry.publication==='published') {
            const identities=[entry.repoUrl,entry.url,entry.homepage].filter((v): v is string => !!v).map(urlKey);
            const [possible]=await c.query<RowDataPacket[]>('SELECT id,url,repo_url FROM works');
            if (possible.some(w => identities.some(u => [w.url,w.repo_url].some(v => urlKey(v)===u)))) {change.action='conflict';change.reason='review_binding_required';}
            else {change.action='create';}
          } else change.action=entry.publication==='withdrawn' ? 'withdraw' : previous ? 'update' : 'bind';
          if (change.action!=='conflict') {
            change.before={mapping:previous,fields:row && row.source==='awesome' ? fieldsOf(row) : null};
            const ownership=previous?.ownership ?? (row?.source==='site' ? 'member' : 'external');
            const fields=ownership==='external' ? projectedFields(entry) : null;
            if (!options.dryRun) {
              if (!workId && entry.publication==='published') {
                const [created]=await c.query<ResultSetHeader>(`INSERT INTO works (source,name,tagline,url,repo_url,author_label,agents,kind,scope,description_md) VALUES ('awesome',?,?,?,?,?,?,?,?,?)`,COLUMNS.map(k => fields![k]));
                workId=created.insertId;change.workId=workId;
              } else if (workId && fields && entry.publication==='published') await writeFields(c,workId,fields);
            }
            const m: Mapping={entry_id:entry.id,work_id:workId,ownership,publication:entry.publication,entry_json:entry,content_hash:hash,applied_fields:entry.publication==='withdrawn' ? previous?.applied_fields ?? change.before.fields : fields,source_revision:revision};
            change.after={mapping:m,fields:entry.publication==='withdrawn' ? change.before.fields : fields};
            if (!options.dryRun) await saveMapping(c,m);
          }
        }
        counts[change.action]++;changes.push(change);
      }
      const [pending]=await c.query<RowDataPacket[]>('SELECT id FROM awesome_sync_runs WHERE cache_pending=1 LIMIT 1');
      result.cachePending=!options.dryRun && (changes.some(ch => !['unchanged','conflict'].includes(ch.action)) || pending.length>0);
      if (options.dryRun) await c.rollback();
      else if (counts.conflict) throw new Error('sync_conflict');
      await c.query(`UPDATE awesome_sync_runs SET status='success',counts=?,changes_json=?,cache_pending=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[JSON.stringify(counts),JSON.stringify(changes),result.cachePending ? 1 : 0,run.insertId]);
      if (!options.dryRun) await c.commit();
      return result;
    } catch (error) {
      await c.rollback();await c.query(`UPDATE awesome_sync_runs SET status='failed',error_code=?,counts=?,changes_json=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[safeError(error),JSON.stringify(counts),JSON.stringify(changes),run.insertId]);throw new Error(safeError(error));
    }
  });
}
export async function rollbackSync(runId: number,pool: Pool=getPool()): Promise<SyncResult> {
  if (!Number.isSafeInteger(runId) || runId<1) throw new Error('rollback_not_found');
  return locked(pool,async c => {
    const [runs]=await c.query<RowDataPacket[]>(`SELECT * FROM awesome_sync_runs WHERE id=? AND action='sync' AND status='success' AND rolled_back_by IS NULL`,[runId]);
    if (!runs[0]) throw new Error('rollback_not_found');const changes=json<Change[]>(runs[0].changes_json);
    const [journal]=await c.query<ResultSetHeader>(`INSERT INTO awesome_sync_runs (action,source_revision,snapshot_hash,status) VALUES ('rollback',?,?,'running')`,[runs[0].source_revision,runs[0].snapshot_hash]);
    await c.beginTransaction();
    try {
      for (const change of changes.filter(ch => ch.after)) {
        const [mr]=await c.query<RowDataPacket[]>('SELECT * FROM awesome_entries WHERE entry_id=? FOR UPDATE',[change.entryId]);const current=mapRow(mr[0]);
        const [wr]=await c.query<RowDataPacket[]>('SELECT * FROM works WHERE id=? FOR UPDATE',[change.workId]);
        if (canonical(current)!==canonical(change.after!.mapping) || (change.after!.fields && (!wr[0] || canonical(fieldsOf(wr[0]))!==canonical(change.after!.fields)))) throw new Error('rollback_conflict');
        if (change.before?.fields) await writeFields(c,change.workId!,change.before.fields);
        if (change.before?.mapping) await saveMapping(c,change.before.mapping);
        else if (change.action==='create' && current) await saveMapping(c,{...current,publication:'withdrawn'});
        else await c.query('DELETE FROM awesome_entries WHERE entry_id=?',[change.entryId]);
      }
      const run={insertId:journal.insertId};
      await c.query(`UPDATE awesome_sync_runs SET status='success',counts=?,changes_json=?,cache_pending=1,finished_at=UTC_TIMESTAMP() WHERE id=?`,[JSON.stringify({rollback:changes.filter(ch => ch.after).length}),JSON.stringify(changes),journal.insertId]);
      await c.query('UPDATE awesome_sync_runs SET rolled_back_by=? WHERE id=?',[run.insertId,runId]);await c.commit();
      return {runId:run.insertId,revision:runs[0].source_revision,dryRun:false,changes,counts:{rollback:changes.filter(ch => ch.after).length},cachePending:true};
    } catch (error) {await c.rollback();await c.query(`UPDATE awesome_sync_runs SET status='failed',error_code=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[safeError(error),journal.insertId]);throw new Error(safeError(error));}
  });
}
export async function markCacheFlushed(runId: number,pool: Pool=getPool()) {
  await pool.query('UPDATE awesome_sync_runs SET cache_pending=0 WHERE cache_pending=1 AND id<=?',[runId]);
}
export async function recordSourceFailure(code: string,pool: Pool=getPool()) {
  await pool.query(`INSERT INTO awesome_sync_runs (action,status,error_code,finished_at) VALUES ('sync','failed',?,UTC_TIMESTAMP())`,[/^source_[a-z_]+$|^invalid_snapshot$/.test(code) ? code : 'source_fetch_failed']);
}
export async function syncHealth(pool: Pool=getPool()) {
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT MAX(CASE WHEN status='success' AND action='sync' THEN finished_at END) AS last_success,
    TIMESTAMPDIFF(HOUR,MAX(CASE WHEN status='success' AND action='sync' THEN finished_at END),UTC_TIMESTAMP()) AS age_hours,
    (SELECT status FROM awesome_sync_runs WHERE action='sync' ORDER BY id DESC LIMIT 1) AS last_status,
    SUM(cache_pending) AS cache_pending FROM awesome_sync_runs`);
  const r=rows[0];return {ok:!!r.last_success && Number(r.age_hours)<=192 && r.last_status==='success' && Number(r.cache_pending)===0,lastSuccess:r.last_success,ageHours:r.age_hours,lastStatus:r.last_status,cachePending:Number(r.cache_pending)||0};
}
