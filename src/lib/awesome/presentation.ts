import type { Entry } from './catalog.mjs';
import type { WorkRow } from '../works';
export const AWESOME_REPOSITORY_URL = 'https://github.com/kimi-builders/awesome-kimi-builders';
export const AWESOME_CONTRIBUTE_URL = `${AWESOME_REPOSITORY_URL}/blob/main/CONTRIBUTING.md`;
export interface WorkCatalog { entry: Entry; revision: string; publication: string; ownership: string }
export function parseWorkCatalog(raw: unknown): WorkCatalog | null {
  try {
    const value=typeof raw==='string' ? JSON.parse(raw) : raw;
    if (!value || typeof value!=='object' || !value.entry || typeof value.entry.name!=='string' || typeof value.entry.id!=='string' || !/^[0-9a-f]{40}$/.test(value.revision) || !['external','member'].includes(value.ownership) || !['published','withdrawn'].includes(value.publication)) return null;
    const e=value.entry;
    if (e.protocolVersion !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id) || (value.publication === 'published' && e.publication !== 'published')) return null;
    if (value.publication === 'published' && (!e.author || typeof e.author.name !== 'string' || !e.author.name.trim() || !safeAuthorUrl(e.author.url))) return null;
    if (typeof e.descriptionZh!=='string' || typeof e.descriptionEn!=='string' || ['bodyZh','bodyEn'].some(key => e[key]!==undefined && typeof e[key]!=='string')) return null;
    if (value.publication==='published' && (typeof e.bodyZh!=='string' || typeof e.bodyEn!=='string')) return null;
    if (e.recommendation && (typeof e.recommendation.url!=='string' || !/^https:\/\/github\.com\/kimi-builders\/awesome-kimi-builders\/pull\/[1-9]\d*$/.test(e.recommendation.url) || typeof e.recommendation.githubLogin!=='string')) return null;

    return value;
  } catch {return null;}
}
export function localizeWork<T extends WorkRow>(work: T,locale: 'zh'|'en'): T {
  const c=work.catalog;
  if (!c || c.ownership!=='external' || c.publication!=='published') return work;
  return {...work,tagline:locale==='zh' ? c.entry.descriptionZh : c.entry.descriptionEn,descriptionMd:(locale==='zh' ? c.entry.bodyZh : c.entry.bodyEn) ?? work.descriptionMd};
}
export function catalogSourceUrl(c: WorkCatalog): string {
  const file=c.entry.sourceFile;
  return file && /^data\/entries\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file) ? `${AWESOME_REPOSITORY_URL}/blob/${c.revision}/${file}` : AWESOME_REPOSITORY_URL;
}

/* This client-safe boundary mirrors the catalog's HTTPS URL policy. */
export function safeAuthorUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500 || /[\s<>\\]/u.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch { return false; }
}

type WorkAttribution = Pick<WorkRow, 'source' | 'authorLabel' | 'handle' | 'catalog'>;
export function workProvenance(work: WorkAttribution): 'repository' | 'legacy' | 'member' {
  if (work.source === 'site') return 'member';
  const catalog = parseWorkCatalog(work.catalog);
  return catalog?.ownership === 'external' && catalog.publication === 'published' ? 'repository' : 'legacy';
}
export function workAuthor(work: WorkAttribution): { name: string; href: string | null; external: boolean } {
  if (work.source === 'site') return { name: work.handle ?? work.authorLabel, href: work.handle ? `/u/${encodeURIComponent(work.handle)}` : null, external: false };
  const catalog = parseWorkCatalog(work.catalog);
  if (catalog?.ownership === 'external' && catalog.entry.author && safeAuthorUrl(catalog.entry.author.url)) {
    return { name: catalog.entry.author.name, href: catalog.entry.author.url, external: true };
  }
  return { name: work.authorLabel, href: /^[A-Za-z0-9-]{1,39}$/.test(work.authorLabel) ? `https://github.com/${work.authorLabel}` : null, external: true };
}
