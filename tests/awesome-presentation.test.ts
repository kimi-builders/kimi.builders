import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkCatalog, workAuthor, workProvenance, safeAuthorUrl } from '../src/lib/awesome/presentation';
import { httpsUrl, type Entry } from '../src/lib/awesome/catalog.mjs';
import { t } from '../src/lib/i18n';
const entry: Entry={protocolVersion:1,id:'fixture',publication:'published',name:'Fixture',url:'https://example.org',descriptionZh:'Kimi 测试。',descriptionEn:'Kimi fixture.',category:'apps',agents:['kimi'],official:false,officialSubject:'none',author:{name:'DocsTeam',url:'https://example.org/docs-team'},bodyZh:'测试',bodyEn:'Test'};
const catalog={entry,revision:'a'.repeat(40),ownership:'external',publication:'published'};
const external={source:'awesome',authorLabel:'OldLabel',handle:null,catalog};
test('provenance requires a valid published external mapping; member and legacy attribution remain distinct',()=>{
 assert.equal(workProvenance(external),'repository');
 assert.equal(workProvenance({...external,catalog:null}),'legacy');
 assert.equal(workProvenance({...external,source:'site',handle:'member',catalog:{...catalog,ownership:'member'}}),'member');
 for(const damaged of [{...catalog,revision:'main'},{...catalog,entry:{...entry,protocolVersion:2}},{...catalog,entry:{...entry,author:{name:'Unsafe',url:'javascript:alert(1)'}}}]) {
  assert.equal(parseWorkCatalog(damaged),null);assert.equal(workProvenance({...external,catalog:damaged as typeof catalog}),'legacy');
 }
 // Rollback withdrawal intentionally keeps the previously published entry snapshot.
 assert.equal(parseWorkCatalog({...catalog,publication:'withdrawn'})?.publication,'withdrawn');
});
test('author URL takes priority for repository entries; compatibility and member targets are retained',()=>{
 assert.deepEqual(workAuthor(external),{name:'DocsTeam',href:'https://example.org/docs-team',external:true});
 assert.deepEqual(workAuthor({...external,catalog:{...catalog,entry:{...entry,author:{name:'GitHub Team',url:'https://github.com/MoonshotAI'}}}}),{name:'GitHub Team',href:'https://github.com/MoonshotAI',external:true});
 assert.equal(workAuthor({...external,catalog:null,authorLabel:'LegacyOrg'}).href,'https://github.com/LegacyOrg');
 assert.equal(workAuthor({...external,catalog:null,authorLabel:'A historical team / author'}).href,null);
 assert.deepEqual(workAuthor({...external,source:'site',handle:'member',catalog:{...catalog,ownership:'member'}}),{name:'member',href:'/u/member',external:false});
});
test('client author validation follows protocol HTTPS restrictions',()=>{
 for(const url of ['https://example.org/team','https://github.com/MoonshotAI','http://example.org','javascript:alert(1)','//example.org','https://a:b@example.org','https://localhost','https://127.0.0.1','https://[::1]','https://example.org:8443','https://example.org/a b','https://example.org/\\x',null,{}]) assert.equal(safeAuthorUrl(url),httpsUrl(url));
});
test('both locales identify all three Awesome sources and mobile accessible meaning',()=>{
 for(const locale of ['zh','en'] as const) {
  const labels=['repository','legacy','member'].map(kind=>t(locale,`awesome.provenance.${kind}` as 'awesome.provenance.repository'));
  assert.equal(new Set(labels).size,3);
  assert.match(t(locale,'awesome.intro'),locale==='zh'?/历史推荐/:/legacy recommendations/);
  assert.match(t(locale,'awesome.statsNote'),locale==='zh'?/历史推荐/:/legacy recommendations/);
  assert.match(t(locale,'awesome.recommendAccessible'),/GitHub/);
  assert.ok(t(locale,'awesome.recommendAccessible').includes(t(locale,'awesome.recommendShort')));
  assert.ok(t(locale,'nav.communityAccessible').includes(t(locale,'nav.communityShort')));
 }
 assert.equal(t('en','awesome.recommendShort'),'Suggest');assert.equal(t('en','awesome.recommend'),'Recommend');
});
