export interface Entry {
  protocolVersion: 1; id: string; publication: 'pending' | 'published' | 'withdrawn';
  name: string; url: string; repoUrl?: string; homepage?: string;
  descriptionZh: string; descriptionEn: string; category: string; agents: string[];
  official: boolean; officialSubject: 'moonshot' | 'community' | 'vendor' | 'none';
  author?: {name: string; url: string}; kind?: string; scope?: 'base' | 'eco' | 'part';
  kimiEvidence?: {url: string; note: string}[];
  review?: {checkedAt: string; revision: string; note: string};
  bodyZh?: string; bodyEn?: string;
  recommendation?: {url: string; githubLogin: string}; sourceFile?: string;
}
export interface Catalog { protocolVersion: 1; repository: string; entryCount: number; pendingIds: string[]; entries: Entry[]; digest: string }
export const REPOSITORY: string;
export const AGENT_IDS: string[];
export const KIND_IDS: string[];
export const CATEGORY_IDS: string[];
export const SLUG: RegExp;
export function canonical(value: unknown): string;
export function digest(value: unknown): string;
export function httpsUrl(value: unknown): boolean;
export function validateEntry(value: unknown, file?: string): string[];
export function buildCatalog(entries: Entry[]): Catalog;
export function validateCatalog(raw: unknown): Catalog;
