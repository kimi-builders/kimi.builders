import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { revalidatePath, revalidateTag } from 'next/cache';
import { cronAuthorized } from '@/src/lib/cron-auth';
import { HOME_CACHE_TAG } from '@/src/lib/home';
import { PUBLIC_WORKS_CACHE_TAG, PUBLIC_FEATURED_CACHE_TAG, PUBLIC_MONTHLY_STATS_CACHE_TAG } from '@/src/lib/cache-tags';
import { fetchApprovedCatalog } from '@/src/lib/awesome/fetch';
import { syncCatalog, rollbackSync, markCacheFlushed, recordSourceFailure, validateBindings, syncHealth, type SyncResult } from '@/src/lib/awesome/sync';
export const runtime = 'nodejs';
async function flush(result: SyncResult) {
  if (!result.cachePending) return;
  for (const tag of [PUBLIC_WORKS_CACHE_TAG,PUBLIC_FEATURED_CACHE_TAG,HOME_CACHE_TAG,PUBLIC_MONTHLY_STATS_CACHE_TAG]) revalidateTag(tag,{expire:0});
  for (const path of ['/awesome','/works','/']) revalidatePath(path);
  revalidatePath('/works/[id]','page');
  for (const change of result.changes) if (change.workId) revalidatePath(`/api/share/work/${change.workId}`);
  await markCacheFlushed(result.runId);
}
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({error:'unauthorized'},{status:401});
  return Response.json(await syncHealth());
}
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({error:'unauthorized'},{status:401});
  if (Number(request.headers.get('content-length'))>1024) return Response.json({error:'invalid_request'},{status:400});
  let body: {dryRun?: boolean; rollbackRunId?: number};
  try {
    const reader=request.body?.getReader();if (!reader) throw new Error();
    const chunks: Uint8Array[]=[];let size=0;
    try { while (true) {const part=await reader.read();if (part.done) break;size+=part.value.byteLength;if (size>1024) throw new Error();chunks.push(part.value);} }
    finally {await reader.cancel().catch(() => {});}
    body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k => !['dryRun','rollbackRunId'].includes(k)) || (body.dryRun!==undefined && typeof body.dryRun!=='boolean') || (body.rollbackRunId!==undefined && (!Number.isSafeInteger(body.rollbackRunId) || body.rollbackRunId<1 || body.dryRun!==undefined))) throw new Error(); }
  catch {return Response.json({error:'invalid_request'},{status:400});}
  try {
    let result: SyncResult;
    if (body.rollbackRunId) result=await rollbackSync(body.rollbackRunId);
    else {
      let approved;
      try { approved=await fetchApprovedCatalog(); }
      catch (error) {await recordSourceFailure(error instanceof Error ? error.message : 'source_fetch_failed');throw error;}
      const bindings=validateBindings(JSON.parse(await readFile(join(process.cwd(),'ops/awesome-bindings.json'),'utf8')));
      result=await syncCatalog(approved.catalog,approved.revision,{dryRun:body.dryRun,bindings});
    }
    await flush(result);
    return Response.json({ok:true,...result});
  } catch (error) {
    const code=error instanceof Error ? error.message : '';
    const allowed=['sync_busy','sync_conflict','rollback_conflict','rollback_not_found','invalid_bindings','invalid_snapshot','source_fetch_failed','source_too_large','source_invalid_json','source_invalid_revision'];
    return Response.json({ok:false,error:allowed.includes(code) ? code : 'sync_failed'},{status:code==='sync_busy'||code.includes('conflict') ? 409 : 503});
  }
}
