/* Pure policy + DTO boundary for the shared anonymous works/awesome cache.
   Only finite, request-independent first-page scopes are admitted. Dates are
   converted to ISO strings before Next serializes the cached payload. */
import { AGENTS } from "./agents";
import { WORK_KINDS } from "./work-kinds";
import type { WorkRow, WorksPage } from "./works";

export type PublicWorksSort = "hot" | "new";
export type PublicAwesomeScope = "base" | "eco" | "part";

export interface PublicWorksCacheScope {
  awesome: boolean;
  sort: PublicWorksSort;
  agents: string[];
  kinds: string[];
  awesomeScope: PublicAwesomeScope | null;
}

export interface PublicWorksScopeInput {
  awesome: boolean;
  sort?: string;
  agents?: string[];
  kinds?: string[];
  scope_?: string;
  viewerId?: number;
  after?: string;
}

const AWESOME_SCOPES = ["base", "eco", "part"] as const;

function canonicalSelection(
  raw: string[] | undefined,
  allowed: readonly string[],
): string[] {
  const selected = new Set<string>();
  for (const value of Array.isArray(raw) ? raw : []) {
    if (typeof value === "string" && allowed.includes(value)) selected.add(value);
    if (selected.size === allowed.length) break;
  }
  return allowed.filter((value) => selected.has(value));
}

/* viewerId and after are deliberately checked by presence, not truthiness:
   even malformed request state must stay on the uncached path. All remaining
   key dimensions are reduced to finite registries in registry order. */
export function publicWorksCacheScope(
  input: PublicWorksScopeInput,
): PublicWorksCacheScope | null {
  if (input.viewerId !== undefined || input.after !== undefined) return null;
  const awesome = input.awesome === true;
  const rawAwesomeScope = awesome ? input.scope_ : undefined;
  const awesomeScope = AWESOME_SCOPES.find(
    (value) => value === rawAwesomeScope,
  ) ?? null;
  return {
    awesome,
    sort: input.sort === "hot" ? "hot" : "new",
    agents: canonicalSelection(
      input.agents,
      AGENTS.map((agent) => agent.id),
    ),
    kinds: canonicalSelection(
      input.kinds,
      WORK_KINDS.map((kind) => kind.id),
    ),
    awesomeScope,
  };
}

export interface PublicWorkDto {
  id: number;
  name: string;
  tagline: string;
  url: string;
  repoUrl: string;
  screenshotUrl: string;
  tags: string[];
  agents: string[];
  source: string;
  visibility: "public";
  hiddenAt: null;
  hiddenReason: null;
  createdAt: string;
  userId: number | null;
  handle: string | null;
  avatarUrl: string | null;
  authorLabel: string;
  featuredAt: string | null;
  featuredReason: string | null;
  voteCount: number;
  commentCount: number;
  claimedTokens: number | null;
  status: string;
  models: string[];
  kind: string;
  descriptionMd: string;
  scope: string;
  logoKey: string;
  imageKeys: string[];
  /* 20260908/20260916:色调/适配/独立封面——列表渲染要用,DTO 必须携带;
     水合时对旧缓存负载给默认值兜底 */
  coverTone: string;
  coverFit: string;
  coverKey: string;
}

export interface PublicWorksPageDto {
  works: PublicWorkDto[];
  nextCursor: string | null;
}

function publicWorkDto(work: WorkRow): PublicWorkDto | null {
  /* Defense in depth: the SQL is already anonymous/public-only, but a future
     query refactor still cannot serialize a private or moderated card. */
  if (work.visibility !== "public" || work.hiddenAt !== null) return null;
  return {
    id: work.id,
    name: work.name,
    tagline: work.tagline,
    url: work.url,
    repoUrl: work.repoUrl,
    screenshotUrl: work.screenshotUrl,
    tags: work.tags,
    agents: work.agents,
    source: work.source,
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    createdAt: work.createdAt.toISOString(),
    userId: work.userId,
    handle: work.handle,
    avatarUrl: work.avatarUrl,
    authorLabel: work.authorLabel,
    featuredAt: work.featuredAt?.toISOString() ?? null,
    featuredReason: work.featuredReason,
    voteCount: work.voteCount,
    commentCount: work.commentCount,
    claimedTokens: work.claimedTokens,
    status: work.status,
    models: work.models,
    kind: work.kind,
    descriptionMd: work.descriptionMd,
    scope: work.scope,
    logoKey: work.logoKey,
    imageKeys: work.imageKeys,
    coverTone: work.coverTone,
    coverFit: work.coverFit,
    coverKey: work.coverKey,
  };
}

export function toPublicWorksPageDto(page: WorksPage): PublicWorksPageDto {
  const works: PublicWorkDto[] = [];
  for (const work of page.works) {
    const dto = publicWorkDto(work);
    if (dto) works.push(dto);
  }
  return { works, nextCursor: page.nextCursor };
}

export function hydratePublicWorksPage(dto: PublicWorksPageDto): WorksPage {
  return {
    works: dto.works.map((work) => ({
      ...work,
      /* 公共清单 DTO 不带收录开关(展示用不到),水合时补默认值;
         20260908 前的旧缓存负载没有 cover_tone/cover_fit,同样补默认 */
      alsoAwesome: false,
      coverTone: work.coverTone ?? "theme",
      coverFit: work.coverFit === "contain" ? "contain" : "cover",
      coverKey: work.coverKey ?? "",
      createdAt: new Date(work.createdAt),
      featuredAt: work.featuredAt === null ? null : new Date(work.featuredAt),
    })),
    nextCursor: dto.nextCursor,
  };
}
