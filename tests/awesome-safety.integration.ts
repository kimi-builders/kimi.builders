import assert from 'node:assert/strict';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../src/lib/db';
import { buildCatalog, type Entry } from '../src/lib/awesome/catalog.mjs';
import { syncCatalog } from '../src/lib/awesome/sync';
import { createWork, updateWork, getWork, getAwesomeWorksPage, type WorkFields } from '../src/lib/works';
import { processAiReply, aiReplyWorkClaimSql } from '../src/lib/ai-reply';
import { workAuthor, workProvenance } from '../src/lib/awesome/presentation';
if (!new URL(process.env.DATABASE_URL ?? '').pathname.includes('kbu-mysql')) throw new Error('isolated kbu-mysql required');
const pool = getPool(), prefix = `safety-${Date.now()}`, rev = 'c'.repeat(40);
const ids: number[] = [], users: number[] = [], runs: number[] = [];
const fields = (extra: Partial<WorkFields> = {}): WorkFields => ({ name: prefix, tagline: 'Kimi fixture', url: 'https://example.org/'+prefix, repoUrl: '', screenshotUrl: '', tags: [], agents: ['kimi'], authorLabel: '', visibility: 'public', claimedTokens: null, status: 'released', models: [], kind: 'app', descriptionMd: '', scope: null, logoKey: '', imageKeys: [], coverKey: '', coverTone: 'theme', coverFit: 'cover', aiReply: true, sourcePath: null, ...extra });
const entry = (suffix: string): Entry => ({ protocolVersion:1, id:prefix+'-'+suffix, publication:'published', name:prefix+'-'+suffix, url:'https://example.org/'+prefix+'/'+suffix, descriptionZh:'隔离测试中的 Kimi 项目。',descriptionEn:'Isolated Kimi fixture.',category:'apps',agents:['kimi'],official:false,officialSubject:'none',author:{name:'DocsTeam',url:'https://example.org/docs-team'},kind:'app',scope:'eco',kimiEvidence:[{url:'https://example.org',note:'Synthetic fixture only.'}],review:{checkedAt:'2026-10-09',revision:rev,note:'Isolated fixture.'},bodyZh:'隔离测试。',bodyEn:'Isolated fixture.' });
async function sync(e: Entry, options: Parameters<typeof syncCatalog>[2] = {}) {
 const result = await syncCatalog(buildCatalog([e]),rev,{pool,...options}); runs.push(result.runId);
 for (const ch of result.changes) if (ch.action === 'create' && ch.workId) ids.push(ch.workId);
 return result.changes[0].workId!;
}
async function user(suffix: string) { const [r]=await pool.query<ResultSetHeader>('INSERT INTO users (handle,name) VALUES (?,?)',[prefix+suffix,'Safety fixture']); users.push(r.insertId);return r.insertId; }
async function work(uid: number, f: WorkFields) { const id = await createWork(uid,f);ids.push(id);return id; }
async function main() {
 const oldFetch=globalThis.fetch,oldKey=process.env.KIMI_API_KEY;let modelCalls=0;
 // Every fetch is intercepted: no real model or network call is possible.
 globalThis.fetch=async()=>{throw new Error('Unexpected model call');};process.env.KIMI_API_KEY='isolated-model-stub';
 try {
  const owner=await user('-owner'), commenter=await user('-reader');
  const member=await work(owner,fields());
  for (const forged of [{authorLabel:'Forged',scope:'base'},{intent:'awesome'},{authorLabel:'Forged'},{scope:'eco'},{kind:'awesome'}]) {
   assert.equal(await updateWork(owner,member,fields(forged)),false);
   assert.equal((await getWork(member))!.source,'site');assert.equal((await getWork(member))!.catalog,null);
  }
  assert.equal(await updateWork(owner,member,fields({name:'Edited member',alsoAwesome:true,intent:'site'})),true);
  const mw=(await getWork(member))!;assert.equal(mw.name,'Edited member');assert.equal(mw.alsoAwesome,true);assert.equal(mw.source,'site');
  const legacy=await work(owner,fields({authorLabel:'Historical author team',scope:'eco'}));
  assert.equal(await updateWork(owner,legacy,fields({authorLabel:'Updated original author',scope:'base',intent:'awesome'})),true);
  assert.equal(await updateWork(owner,legacy,fields({intent:'site'})),false);
  const imported=entry('repository');const rid=await sync(imported);
  await pool.query('UPDATE works SET user_id=? WHERE id=?',[owner,rid]);
  assert.equal(await updateWork(owner,rid,fields({intent:'awesome',authorLabel:'DocsTeam',scope:'eco'})),false);
  const page=await getAwesomeWorksPage({sort:'new'});
  for (const [id,classification,href] of [[rid,'repository','https://example.org/docs-team'],[legacy,'legacy',null],[member,'member',`/u/${prefix}-owner`]] as const) {
   const row=page.works.find(w=>w.id===id);assert.ok(row);assert.equal(workProvenance(row),classification);assert.equal(workAuthor(row).href,href);
  }
  console.log('PASS N2: forged kind/author/scope rejected, member edit and opt-in, legacy transition edit, repository ownership; N4/N5 mixed DB projection and attribution');
  for (const scenario of ['before','during','normal','work-disabled','author-disabled','switch-during'] as const) {
   const e=entry(scenario), wid=await sync(e);
   if(scenario==='author-disabled') { await pool.query('UPDATE works SET user_id=? WHERE id=?',[owner,wid]);await pool.query('UPDATE users SET ai_replies_enabled=0 WHERE id=?',[owner]); }
   if(scenario==='work-disabled') await pool.query('UPDATE works SET ai_reply=0 WHERE id=?',[wid]);
   const [comment]=await pool.query<ResultSetHeader>('INSERT INTO work_comments (work_id,user_id,body) VALUES (?,?,?)',[wid,commenter,'@kimi explain this fixture']);
   await pool.query('UPDATE works SET comment_count=1 WHERE id=?',[wid]);
   const [job]=await pool.query<ResultSetHeader>("INSERT INTO ai_reply_jobs (work_id,work_comment_id,kind) VALUES (?,?,'mention')",[wid,comment.insertId]);
   if(scenario==='before') { await sync({...e,publication:'withdrawn'});const [eligible]=await pool.query<RowDataPacket[]>(aiReplyWorkClaimSql(),[wid]);assert.equal(eligible.length,0); }
   const previousCalls=modelCalls;
   globalThis.fetch=async(url)=>{
    assert.equal(String(url),'https://api.moonshot.cn/v1/chat/completions');modelCalls++;
    if(scenario==='during') await sync({...e,publication:'withdrawn'});
    if(scenario==='switch-during') await pool.query('UPDATE works SET ai_reply=0 WHERE id=?',[wid]);
    return Response.json({choices:[{message:{content:'A stubbed answer.'}}]});
   };
   await processAiReply(job.insertId);
   const [jobs]=await pool.query<RowDataPacket[]>('SELECT status,error FROM ai_reply_jobs WHERE id=?',[job.insertId]);
   const [comments]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) n FROM work_comments WHERE work_id=? AND is_ai=1',[wid]);
   const [counts]=await pool.query<RowDataPacket[]>('SELECT comment_count FROM works WHERE id=?',[wid]);
   const [notices]=await pool.query<RowDataPacket[]>('SELECT COUNT(*) n FROM notifications WHERE work_id=?',[wid]);
   const normal=scenario==='normal';assert.equal(jobs[0].status,normal?'done':'skipped',JSON.stringify(jobs));assert.equal(comments[0].n,normal?1:0);assert.equal(counts[0].comment_count,normal?2:1);assert.equal(notices[0].n,normal?1:0);
   assert.equal(modelCalls-previousCalls,['before','work-disabled','author-disabled'].includes(scenario)?0:1);
   await processAiReply(job.insertId);assert.equal(modelCalls-previousCalls,['before','work-disabled','author-disabled'].includes(scenario)?0:1);
   if(scenario==='author-disabled') await pool.query('UPDATE users SET ai_replies_enabled=1 WHERE id=?',[owner]);
   console.log(`PASS N3 ${scenario}: status=${jobs[0].status}, model calls=${modelCalls-previousCalls}, replies=${comments[0].n}, counter=${counts[0].comment_count}, notifications=${notices[0].n}`);
  }
 } finally {
  globalThis.fetch=oldFetch;if(oldKey===undefined) delete process.env.KIMI_API_KEY;else process.env.KIMI_API_KEY=oldKey;
  for(const id of ids) { await pool.query('DELETE FROM notifications WHERE work_id=?',[id]);await pool.query('DELETE FROM awesome_entries WHERE work_id=?',[id]);await pool.query('DELETE FROM works WHERE id=?',[id]); }
  for(const id of users) await pool.query('DELETE FROM users WHERE id=?',[id]);
  for(const id of runs) await pool.query('DELETE FROM awesome_sync_runs WHERE id=?',[id]);
  await pool.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
