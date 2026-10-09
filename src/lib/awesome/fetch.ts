import { REPOSITORY, validateCatalog, type Catalog } from './catalog.mjs';
export interface ApprovedCatalog { catalog: Catalog; revision: string }
const MAX_BYTES = 2 * 1024 * 1024;
/* Both requests share a deadline; no entry URL is ever fetched by the site. */
export async function fetchApprovedCatalog(fetcher: typeof fetch = fetch): Promise<ApprovedCatalog> {
  const signal = AbortSignal.timeout(20_000);
  const read = async (url: string, github: boolean) => {
    const response = await fetcher(url, {
      signal, redirect: 'error', cache: 'no-store',
      headers: { 'Accept': github ? 'application/vnd.github+json' : 'application/json',
        'User-Agent': 'kimi-builders-awesome-sync',
        ...(github && process.env.AWESOME_GITHUB_READ_TOKEN ? {Authorization:`Bearer ${process.env.AWESOME_GITHUB_READ_TOKEN}`} : {}) },
    });
    if (!response.ok || !response.body || response.redirected) throw new Error('source_fetch_failed');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('source_too_large');
    const reader = response.body.getReader();const chunks: Uint8Array[] = [];let size = 0;
    try { while (true) { const {done,value} = await reader.read();if (done) break;size += value.byteLength;if (size > MAX_BYTES) throw new Error('source_too_large');chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new Error('source_invalid_json'); }
  };
  const ref = await read(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/main`,true) as {object?: {sha?: unknown}};
  const revision = ref?.object?.sha;
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) throw new Error('source_invalid_revision');
  const catalog = validateCatalog(await read(`https://raw.githubusercontent.com/${REPOSITORY}/${revision}/data/catalog.json`,false));
  return {catalog,revision};
}
