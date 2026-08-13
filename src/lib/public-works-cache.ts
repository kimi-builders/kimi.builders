/* Shared cache for anonymous /works and /awesome page 1 only. Cache Components
   are disabled in this app, so this uses unstable_cache. The callback accepts
   a bounded public scope and returns a JSON-only DTO. */
import { unstable_cache } from "next/cache";
import {
  PUBLIC_USERS_CACHE_TAG,
  PUBLIC_WORKS_CACHE_TAG,
} from "./cache-tags";
import {
  hydratePublicWorksPage,
  publicWorksCacheScope,
  toPublicWorksPageDto,
  type PublicAwesomeScope,
  type PublicWorksCacheScope,
  type PublicWorksPageDto,
  type PublicWorksSort,
} from "./public-works";
import {
  getAwesomeWorksPage,
  getWorksPage,
  type WorksPage,
} from "./works";

export const PUBLIC_WORKS_REVALIDATE_SECONDS = 60;

async function loadAnonymousFirstPageDto(
  awesome: boolean,
  sort: PublicWorksSort,
  agents: string[],
  kinds: string[],
  awesomeScope: PublicAwesomeScope | null,
): Promise<PublicWorksPageDto> {
  /* No viewer or cursor is accepted here. worksPageQuery therefore applies
     public + non-hidden predicates before the database returns rows. */
  const page = awesome
    ? await getAwesomeWorksPage({
        sort,
        agents,
        kinds,
        scope: awesomeScope ?? undefined,
      })
    : await getWorksPage({ sort, agents, kinds });
  return toPublicWorksPageDto(page);
}

const getCachedAnonymousFirstPageDto = unstable_cache(
  loadAnonymousFirstPageDto,
  ["works-awesome-anonymous-first-page-v1"],
  {
    revalidate: PUBLIC_WORKS_REVALIDATE_SECONDS,
    tags: [PUBLIC_WORKS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export async function getPublicWorksFirstPage(
  scope: PublicWorksCacheScope,
): Promise<WorksPage> {
  /* Re-canonicalize at the cache entrypoint too: runtime callers cannot expand
     the cache key through an any-cast or mutate a previously accepted scope. */
  const bounded = publicWorksCacheScope({
    awesome: scope.awesome,
    sort: scope.sort,
    agents: scope.agents,
    kinds: scope.kinds,
    scope_: scope.awesomeScope ?? undefined,
  });
  const dto = await getCachedAnonymousFirstPageDto(
    bounded?.awesome ?? false,
    bounded?.sort ?? "new",
    bounded?.agents ?? [],
    bounded?.kinds ?? [],
    bounded?.awesomeScope ?? null,
  );
  return hydratePublicWorksPage(dto);
}
