import assert from 'node:assert/strict';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../src/lib/db';
import { buildCatalog, type Entry } from '../src/lib/awesome/catalog.mjs';
import { syncCatalog, rollbackSync, projectedFields } from '../src/lib/awesome/sync';
import { getWork, getAwesomeWorksPage, canViewWork, getVisibleWorkAccess, deleteWork } from '../src/lib/works';
import { localizeWork } from '../src/lib/awesome/presentation';
if (!new URL(process.env.DATABASE_URL ?? '').pathname.includes('kbu-mysql')) throw new Error('isolated kbu-mysql database required');
const pool=getPool();const prefix=`fixture-awesome-${Date.now()}`;const workIds: number[]=[];const runIds: number[]=[];let userId=0;
const rev='a'.repeat(40);
const entry=(id: string): Entry => ({protocolVersion:1,id:`${prefix}-${id}`,publication:'published',name:'Same name',url:`https://github.com/test-fixture/${prefix}-${id}`,descriptionZh:'隔离测试中的 Kimi 项目。',descriptionEn:'Kimi project in an isolated test.',category:'apps',agents:['kimi'],official:false,officialSubject:'none',author:{name:'Test fixture',url:'https://github.com/test-fixture'},kind:'app',scope:'base',kimiEvidence:[{url:'https://github.com/test-fixture',note:'Synthetic test fixture only.'}],review:{checkedAt:'2026-10-09',revision:rev,note:'Isolated test data, not a public recommendation.'},bodyZh:'## 介绍\n隔离测试正文。',bodyEn:'## Introduction\nIsolated test body.'});
const run=async (entries: Entry[],options: Parameters<typeof syncCatalog>[2]={}) => {const r=await syncCatalog(buildCatalog(entries),rev,{pool,...options});runIds.push(r.runId);for (const ch of r.changes) if (ch.action==='create' && ch.workId) workIds.push(ch.workId);return r;};
const existing=async (e: Entry,source='awesome') => {
 const fields=projectedFields(e);const [r]=await pool.query<ResultSetHeader>(`INSERT INTO works (source,user_id,name,tagline,url,repo_url,author_label,agents,kind,scope,description_md,created_at,featured_at,featured_by,featured_reason,vote_count,comment_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,'2026-01-01',UTC_TIMESTAMP(),?,'editor choice',1,1)`,[source,userId,...Object.values(fields),userId]);workIds.push(r.insertId);
 await pool.query('INSERT INTO work_votes (work_id,user_id) VALUES (?,?)',[r.insertId,userId]);await pool.query('INSERT INTO work_comments (work_id,user_id,body) VALUES (?,?,?)',[r.insertId,userId,'existing discussion']);return r.insertId;
};
async function main() {
try {
 const [u]=await pool.query<ResultSetHeader>('INSERT INTO users (handle,name) VALUES (?,?)',[prefix.slice(-32),'Test fixture']);userId=u.insertId;
 const a=entry('a'),b=entry('b');
 const [before]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM works');
 const dry=await run([a,b],{dryRun:true});assert.equal(dry.counts.create,2);
 const [after]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM works');assert.equal(after[0].n,before[0].n);
 const first=await run([a,b]);assert.equal(first.counts.create,2);assert.notEqual(first.changes[0].workId,first.changes[1].workId);
 const repeat=await run([a,b]);assert.equal(repeat.counts.unchanged,2);assert.equal(repeat.counts.update,0);
 const id=first.changes[0].workId!;const moved={...a,url:`https://github.com/transferred/${prefix}`,name:'Renamed'};
 const movedRun=await run([moved,b]);assert.equal(movedRun.counts.update,1);assert.equal(movedRun.changes[0].workId,id);
 const work=(await getWork(id))!;assert.equal(localizeWork(work,'zh').descriptionMd,a.bodyZh);assert.equal(localizeWork(work,'en').descriptionMd,a.bodyEn);assert.equal(localizeWork(work,'en').id,work.id);
 console.log('PASS create, repeat, same-name identity, transfer and bilingual shared ID');
 const ext=entry('bound'),boundId=await existing(ext);
 await assert.rejects(run([ext]),/sync_conflict/);
 const bound=await run([ext],{bindings:[{entryId:ext.id,workId:boundId,expectedUrl:ext.url}]});assert.equal(bound.counts.bind,1);
 await pool.query("UPDATE works SET hidden_at=UTC_TIMESTAMP(),hidden_by=?,hidden_reason='moderated',visibility='private' WHERE id=?",[userId,boundId]);
 await run([{...ext,descriptionEn:'Revised Kimi fixture.'}]);
 const [preserved]=await pool.query<RowDataPacket[]>('SELECT * FROM works WHERE id=?',[boundId]);const row=preserved[0];assert.equal(Number(row.user_id),userId);assert.ok(row.featured_at);assert.ok(row.hidden_at);assert.equal(row.visibility,'private');assert.equal(row.vote_count,1);assert.equal(row.comment_count,1);assert.equal(row.created_at.getUTCFullYear(),2026);
 await pool.query("UPDATE works SET name='manual override' WHERE id=?",[id]);await assert.rejects(run([moved,b]),/sync_conflict/);await pool.query('UPDATE works SET name=? WHERE id=?',[moved.name,id]);
 const member=entry('member'),memberId=await existing(member,'site');
 const memberBind=await run([member],{bindings:[{entryId:member.id,workId:memberId,expectedUrl:member.url}]});assert.equal(memberBind.counts.bind,1);
 await run([{...member,name:'Repository renamed member'}]);const mw=(await getWork(memberId))!;assert.equal(mw.name,'Same name');assert.equal(mw.source,'site');assert.equal(mw.alsoAwesome,false);assert.equal(mw.userId,userId);
 console.log('PASS exact binding, recommender/creation/interactions/curation/moderation preserved, manual override conflict, member ownership');
 const withdrawn=await run([{...ext,publication:'withdrawn'}]);assert.equal(withdrawn.counts.withdraw,1);const [discussion]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM work_comments WHERE work_id=?',[boundId]);assert.equal(discussion[0].n,1);
 await run([{...b,publication:'pending'}]);assert.ok(canViewWork((await getWork(first.changes[1].workId!))!,null));
 await run([{...moved,publication:'withdrawn'}]);assert.equal(canViewWork((await getWork(id))!,null),false);assert.ok(!(await getAwesomeWorksPage()).works.some(w => w.id===id));
 const publicAgain=await run([moved]);assert.equal(publicAgain.counts.update,1);assert.equal(canViewWork((await getWork(id))!,null),true);
 await pool.query('UPDATE works SET vote_count=9,hidden_at=UTC_TIMESTAMP(),hidden_by=? WHERE id=?',[userId,id]);
 const rollback=await rollbackSync(publicAgain.runId,pool);runIds.push(rollback.runId);assert.equal((await getWork(id))!.voteCount,9);assert.ok((await getWork(id))!.hiddenAt);assert.equal((await getWork(id))!.catalog?.publication,'withdrawn');
 console.log('PASS explicit withdrawal retains discussion, missing/pending does not withdraw, rollback preserves later moderation/interaction');
 const lock=await pool.getConnection();await lock.query('SELECT GET_LOCK(?,0)',['kimi-builders:awesome-v1']);await assert.rejects(run([a]),/sync_busy/);await lock.query('SELECT RELEASE_LOCK(?)',['kimi-builders:awesome-v1']);lock.release();
 assert.equal(await getVisibleWorkAccess(id,{id:userId,role:'member'}),null);
 const deletable=entry('deletable'),deleteId=await existing(deletable,'site');
 await run([deletable],{bindings:[{entryId:deletable.id,workId:deleteId,expectedUrl:deletable.url}]});
 assert.equal(await deleteWork(userId,deleteId),true);
 await assert.rejects(run([deletable]),/sync_conflict/);
 await run([{...deletable,publication:'withdrawn'}]);
 console.log('PASS withdrawn mutation rejection, member deletion allowed, tombstone prevents recreation');
 const c=entry('transaction');
 await assert.rejects(run([c,entry('missing')],{bindings:[{entryId:entry('missing').id,workId:999999999,expectedUrl:entry('missing').url}]}),/sync_conflict/);
 const [partial]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM awesome_entries WHERE entry_id=?',[c.id]);assert.equal(partial[0].n,0);
 const retry=await run([c]);assert.equal(retry.counts.create,1);
 const invalid=buildCatalog([c]);invalid.entryCount++;
 await assert.rejects(syncCatalog(invalid,rev,{pool}),/invalid_snapshot/);
 console.log('PASS advisory lock, transaction failure rolls back complete batch, retry, invalid snapshot rejection');
} finally {
 await pool.query('DELETE FROM awesome_entries WHERE entry_id LIKE ?',[`${prefix}%`]);
 const [rows]=await pool.query<RowDataPacket[]>('SELECT id FROM works WHERE repo_url LIKE ? OR id IN (?)',[`%${prefix}%`,workIds.length ? workIds : [0]]);
 for (const row of rows) {await pool.query('DELETE FROM work_comments WHERE work_id=?',[row.id]);await pool.query('DELETE FROM work_votes WHERE work_id=?',[row.id]);await pool.query('DELETE FROM works WHERE id=?',[row.id]);}
 if (userId) await pool.query('DELETE FROM users WHERE id=?',[userId]);
 await pool.query('DELETE FROM awesome_sync_runs WHERE source_revision=?',[rev]);await pool.end();
}

}
main().catch(error => { console.error(error);process.exitCode=1; });
