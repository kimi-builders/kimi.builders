import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';

// macOS lacks util-linux flock; fcntl uses the same inherited-descriptor OS lock.
const flockShim = `#!/usr/bin/env python3
import fcntl,sys,time
args=sys.argv[1:]
wait=float(args[1]) if args[0]=='-w' else 0
end=time.monotonic()+wait
while True:
 try:
  fcntl.flock(int(args[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)
  break
 except BlockingIOError:
  if time.monotonic()>=end: sys.exit(1)
  time.sleep(.01)
`;

test('Awesome runner waits, defers observably, retries within a budget and coexists with minute health', { timeout: 30000 }, async () => {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'awesome-cron-'))), bin=join(root,'bin'), shared=join(root,'shared'), version='a'.repeat(40), release=join(root,'releases',version);
 mkdirSync(bin);mkdirSync(shared);mkdirSync(release,{recursive:true});symlinkSync(release,join(root,'current'));
 writeFileSync(join(release,'AWESOME_SYNC_ENABLED'),'enabled');
 writeFileSync(join(release,'.env.production'),"CRON_SECRET='fixture-secret-at-least-32-characters'\nHEALTH_ALERT_WEBHOOK_URL='https://example.org/alerts'\n");
 copyFileSync(resolve('ops/verify-deploy-state.mjs'),join(shared,'verify-deploy-state.mjs'));
 if(spawnSync('sh',['-c','command -v flock']).status!==0) writeFileSync(join(bin,'flock'),flockShim,{mode:0o755});
 writeFileSync(join(bin,'logger'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 const curl=spawnSync('sh',['-c','command -v curl'],{encoding:'utf8'}).stdout.trim();
 writeFileSync(join(bin,'curl'),`#!/bin/sh\nfor arg do\n if [ "$arg" = 'https://example.org/alerts' ]; then printf '%s\\n' "$*" >> "$TEST_ALERT_LOG"; exit 0; fi\ndone\nexec "${curl}" "$@"\n`,{mode:0o755});
 const env={...process.env,PATH:bin+':'+process.env.PATH,AWESOME_LOCK_WAIT_SECONDS:'1',TEST_ALERT_LOG:join(root,'alerts')};
 let posts=0,changes=0,fail=false,deepSeen:()=>void=()=>{};
 const server=createServer((req,res)=>{
  if(req.url==='/api/health/deep') {deepSeen();setTimeout(()=>res.end(JSON.stringify({ok:true,db:true,version})),200);return;}
  assert.equal(req.headers.authorization,'Bearer fixture-secret-at-least-32-characters');
  if(req.method==='POST') posts++;
  if(fail) {res.writeHead(503);res.end('{}');return;}
  const changed=req.method==='POST' && changes===0;if(changed) changes++;
  res.end(JSON.stringify({ok:true,counts:{update:changed?1:0,unchanged:changed?0:1}}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
 const runner=process.env.AWESOME_CRON_UNDER_TEST ?? resolve('ops/awesome-cron.sh');
 const run=(mode:string,script=runner)=>new Promise<{code:number|null;output:string}>((done,reject)=>{
  const c=spawn('bash',[script,root,String(port),mode],{env});let output='';c.stdout.on('data',s=>output+=s);c.stderr.on('data',s=>output+=s);c.on('error',reject);c.on('close',code=>done({code,output}));
 });
 const hold=async()=>{
  const c=spawn('bash',['-c','exec 9>"$1"; flock --nonblock 9 || exit 1; echo ready; read -r release','hold',join(shared,'deploy-health.lock')],{env});
  const ready=await once(c.stdout,'data');assert.match(String(ready[0]),/ready/);
  return async()=>{const finished=once(c,'close');c.stdin.end('\n');await finished;};
 };
 try {
  let unlock=await hold();const waiting=run('sync');setTimeout(()=>void unlock(),200);let r=await waiting;assert.equal(r.code,0,r.output);assert.equal(posts,1);assert.equal(changes,1);
  unlock=await hold();r=await run('sync');assert.equal(r.code,75,r.output);assert.match(r.output,/deferred.*timeout/);assert.equal(posts,1);assert.equal(readFileSync(join(shared,'health/awesome.pending'),'utf8').trim(),'1');assert.equal(readFileSync(join(shared,'health/awesome.state'),'utf8').trim(),'deferred');assert.ok(existsSync(join(shared,'health/awesome.alert')));await unlock();
  r=await run('retry');assert.equal(r.code,0,r.output);assert.equal(posts,2);assert.equal(changes,1);assert.match(r.output,/"update":0/);assert.ok(!existsSync(join(shared,'health/awesome.pending')));
  assert.match(readFileSync(join(root,'alerts'),'utf8'),/deferred/);assert.match(readFileSync(join(root,'alerts'),'utf8'),/awesome ok/);
  r=await run('retry');assert.equal(r.code,0);assert.match(r.output,/idle/);assert.equal(posts,2);
  const deepRequested=new Promise<void>(done=>{deepSeen=done;});const deep=run('deep-health',resolve('ops/deep-health-check.sh'));await deepRequested;
  r=await run('sync');assert.equal(r.code,0,r.output);assert.equal((await deep).code,0);assert.equal(changes,1);
  fail=true;r=await run('sync');assert.equal(r.code,1);assert.match(r.output,/failed/);assert.ok(existsSync(join(shared,'health/awesome.pending')));fail=false;
  writeFileSync(join(shared,'health/awesome.pending'),'7\n');unlock=await hold();r=await run('retry');assert.equal(r.code,75);await unlock();const beforeBudget=posts;
  r=await run('retry');assert.equal(r.code,1);assert.match(r.output,/budget exhausted/);assert.equal(posts,beforeBudget);
  r=await run('health');assert.equal(r.code,1);assert.match(r.output,/budget exhausted/);
  r=await run('sync');assert.equal(r.code,0,r.output);assert.equal(changes,1);
  writeFileSync(join(shared,'health/awesome.active'),'2\n');r=await run('retry');assert.equal(r.code,0);assert.ok(!existsSync(join(shared,'health/awesome.active')));assert.equal(changes,1);
  rmSync(join(release,'AWESOME_SYNC_ENABLED'));r=await run('sync');assert.equal(r.code,75);assert.match(r.output,/does not support/);assert.ok(existsSync(join(shared,'health/awesome.pending')));
 } finally { await new Promise<void>(done=>server.close(()=>done()));rmSync(root,{recursive:true,force:true}); }
});
