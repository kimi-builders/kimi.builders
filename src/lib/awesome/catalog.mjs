import { createHash } from 'node:crypto';
export const REPOSITORY = 'kimi-builders/awesome-kimi-builders';
export const AGENT_IDS = ['kimi','kimi-agent','agent-swarm','claude-code','codex','cursor','copilot','windsurf','trae','cline','gemini','qoder','zcode','workbuddy','pi-agent'];
export const KIND_IDS = ['app','miniapp','website','extension','cli','sdk','bot','workflow','skill','prompt','slides','demo','content','other'];
export const CATEGORY_IDS = ['official','cli-agents','sdks','apps','integrations','learning'];
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\s<>\\]/u.test(value)) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && !['localhost','127.0.0.1','[::1]'].includes(u.hostname); } catch { return false; }
}
export function validateEntry(entry, file) {
  const errors = [];
  const fail = msg => errors.push(msg);
  if (!object(entry)) return ['entry must be an object'];
  const text = (key,max) => { if (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > max) fail(`${key} must be a nonempty string <= ${max}`); };
  if (file !== undefined && (!SLUG.test(file.replace(/\.json$/, '')) || !file.endsWith('.json'))) fail('invalid filename');
  if (entry.protocolVersion !== 1) fail('unsupported protocolVersion');
  if (typeof entry.id !== 'string' || !SLUG.test(entry.id) || entry.id.length > 80) fail('invalid immutable id');
  if (!['pending','published','withdrawn'].includes(entry.publication)) fail('invalid publication');
  text('name',60); text('descriptionZh',120); text('descriptionEn',160);
  if (!httpsUrl(entry.url) || entry.url.endsWith('/')) fail('invalid url');
  for (const key of ['homepage','repoUrl']) if (entry[key] !== undefined && !httpsUrl(entry[key])) fail(`invalid ${key}`);
  if (!CATEGORY_IDS.includes(entry.category)) fail('invalid category');
  if (!Array.isArray(entry.agents) || entry.agents.some(a => !AGENT_IDS.includes(a)) || new Set(entry.agents).size !== entry.agents.length) fail('invalid agents');
  if (typeof entry.official !== 'boolean') fail('official must be boolean');
  if (!['moonshot','community','vendor','none'].includes(entry.officialSubject) || entry.official !== (entry.officialSubject === 'moonshot')) fail('official must identify Moonshot only');
  for (const field of ['descriptionZh','descriptionEn']) if (typeof entry[field] === 'string' && /(最好|最强|第一|best ever|#1|\p{Extended_Pictographic})/iu.test(entry[field])) fail(`${field} contains marketing or emoji`);
  if (entry.author !== undefined && (!object(entry.author) || typeof entry.author.name !== 'string' || !entry.author.name.trim() || entry.author.name.length > 120 || !httpsUrl(entry.author.url))) fail('invalid author');
  if (entry.scope !== undefined && !['base','eco','part'].includes(entry.scope)) fail('invalid scope');
  if (entry.kind !== undefined && !KIND_IDS.includes(entry.kind)) fail('invalid kind');
  if (entry.kimiEvidence !== undefined && (!Array.isArray(entry.kimiEvidence) || entry.kimiEvidence.length > 10 || entry.kimiEvidence.some(e => !object(e) || !httpsUrl(e.url) || typeof e.note !== 'string' || !e.note.trim() || e.note.length > 500))) fail('invalid kimiEvidence');
  if (entry.review !== undefined && (!object(entry.review) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.review.checkedAt ?? '') || typeof entry.review.revision !== 'string' || !entry.review.revision.trim() || entry.review.revision.length > 120 || typeof entry.review.note !== 'string' || !entry.review.note.trim() || entry.review.note.length > 1000)) fail('invalid review');
  for (const key of ['bodyZh','bodyEn']) if (entry[key] !== undefined && (typeof entry[key] !== 'string' || !entry[key].trim() || entry[key].length > 20000 || Buffer.byteLength(entry[key]) > 40000)) fail(`invalid ${key}`);
  if (entry.recommendation !== undefined && (!object(entry.recommendation) || !/^https:\/\/github\.com\/kimi-builders\/awesome-kimi-builders\/pull\/[1-9]\d*$/.test(entry.recommendation.url ?? '') || !/^[A-Za-z0-9-]{1,39}$/.test(entry.recommendation.githubLogin ?? ''))) fail('invalid recommendation');
  if (entry.publication === 'published') for (const key of ['author','scope','kind','kimiEvidence','review','bodyZh','bodyEn']) if (entry[key] === undefined || (key === 'kimiEvidence' && (!Array.isArray(entry[key]) || entry[key].length === 0))) fail(`published entry needs ${key}`);
  if (entry.publication === 'withdrawn' && !entry.review) fail('withdrawal needs explicit review');
  const allowed = ['protocolVersion','id','publication','name','url','repoUrl','homepage','descriptionZh','descriptionEn','category','agents','official','officialSubject','author','kind','scope','kimiEvidence','review','bodyZh','bodyEn','recommendation','sourceFile'];
  if (entry.sourceFile !== undefined && (typeof entry.sourceFile !== 'string' || !/^data\/entries\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.sourceFile))) fail('invalid sourceFile');
  for (const key of Object.keys(entry)) if (!allowed.includes(key)) fail(`unknown field: ${key}`);
  return errors;
}
export function buildCatalog(entries) {
  const sorted = [...entries].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const payload = {protocolVersion:1,repository:REPOSITORY,entryCount:entries.length,pendingIds:sorted.filter(e => e.publication === 'pending').map(e => e.id),entries:sorted.filter(e => e.publication !== 'pending')};
  return {...payload,digest:digest(payload)};
}
export function validateCatalog(raw) {
  if (!object(raw)) throw new Error('invalid_snapshot');
  const {digest:hash,...payload} = raw;
  if (Object.keys(payload).sort().join(',') !== 'entries,entryCount,pendingIds,protocolVersion,repository' || payload.protocolVersion !== 1 || payload.repository !== REPOSITORY || !Number.isSafeInteger(payload.entryCount) || payload.entryCount < 1 || payload.entryCount > 2000 || !Array.isArray(payload.entries) || !Array.isArray(payload.pendingIds) || payload.entries.length + payload.pendingIds.length !== payload.entryCount || typeof hash !== 'string' || hash !== digest(payload)) throw new Error('invalid_snapshot');
  const ids = new Set(); const urls = new Set();
  for (const id of payload.pendingIds) { if (typeof id !== 'string' || !SLUG.test(id) || id.length > 80 || ids.has(id)) throw new Error('invalid_snapshot'); ids.add(id); }
  for (const e of payload.entries) {
    if (validateEntry(e).length || e.publication === 'pending' || ids.has(e.id) || urls.has(e.url.toLowerCase())) throw new Error('invalid_snapshot');
    ids.add(e.id);urls.add(e.url.toLowerCase());
  }
  return raw;
}
