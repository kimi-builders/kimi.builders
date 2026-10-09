import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENTS } from '../src/lib/agents';
import { WORK_KINDS } from '../src/lib/work-kinds';
import { AGENT_IDS,KIND_IDS,buildCatalog,validateCatalog,validateEntry,type Entry } from '../src/lib/awesome/catalog.mjs';
import { parseWorkCatalog } from '../src/lib/awesome/presentation';
import { fetchApprovedCatalog } from '../src/lib/awesome/fetch';
const pending: Entry={protocolVersion:1,id:'fixture',publication:'pending',name:'Fixture',url:'https://github.com/fixture/example',descriptionZh:'Kimi 测试。',descriptionEn:'Kimi test.',category:'apps',agents:['kimi'],official:false,officialSubject:'none'};
test('shared agent and kind protocol registries match site registries',()=>{assert.deepEqual(AGENT_IDS,AGENTS.map(a=>a.id));assert.deepEqual(KIND_IDS,WORK_KINDS.map(a=>a.id));});
test('catalog diagnostics tolerate malformed values and reject unsafe paths',()=>{
 for (const value of [null,[],false,{}, {...pending,publication:'published',kimiEvidence:null}, {...pending,sourceFile:'../secret'}]) assert.ok(validateEntry(value).length);
 const c=buildCatalog([pending]);assert.deepEqual(validateCatalog(c),c);assert.throws(()=>validateCatalog({...c,entryCount:2}));
});
test('fixed main revision is resolved once and all content is read at that SHA',async()=>{
 const calls:string[]=[];const sha='b'.repeat(40),catalog=buildCatalog([pending]);
 const fetcher=(async (url,init)=>{calls.push(String(url));assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');return Response.json(calls.length===1 ? {object:{sha}} : catalog);}) as typeof fetch;
 assert.deepEqual(await fetchApprovedCatalog(fetcher),{revision:sha,catalog});assert.equal(calls[1],`https://raw.githubusercontent.com/kimi-builders/awesome-kimi-builders/${sha}/data/catalog.json`);
});
test('network, invalid JSON, truncated catalogs and volume failures reject entire source',async()=>{
 for (const response of [new Response('bad json'),Response.json({}),new Response('x',{status:500}),new Response('x',{headers:{'content-length':'3000000'}})]) {
  const fetcher=(async(url)=>String(url).includes('api.github.com') ? Response.json({object:{sha:'c'.repeat(40)}}) : response) as typeof fetch;
  await assert.rejects(fetchApprovedCatalog(fetcher));
 }
 await assert.rejects(fetchApprovedCatalog((async()=>{throw new Error('timeout');}) as typeof fetch));
});

test('corrupt projection bodies fall back safely at the rendering boundary',()=>{
 const raw={entry:{...pending,bodyZh:{invalid:true},bodyEn:'Body'},revision:'c'.repeat(40),publication:'published',ownership:'external'};
 assert.equal(parseWorkCatalog(raw),null);assert.equal(parseWorkCatalog('not-json'),null);
});
