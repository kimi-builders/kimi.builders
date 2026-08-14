import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hydratePublicWorksPage,
  publicWorksCacheScope,
  toPublicWorksPageDto,
} from "../src/lib/public-works";
import { worksPageQuery, type WorkRow } from "../src/lib/works";

function work(overrides: Partial<WorkRow> = {}): WorkRow {
  return {
    id: 1,
    name: "Public work",
    tagline: "Built in public",
    url: "https://example.com",
    repoUrl: "https://example.com/repo",
    screenshotUrl: "",
    tags: ["demo"],
    agents: ["kimi", "codex"],
    source: "site",
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    createdAt: new Date("2026-08-12T12:00:00.000Z"),
    userId: 7,
    handle: "builder",
    avatarUrl: "/avatar.svg",
    authorLabel: "",
    featuredAt: new Date("2026-08-12T13:00:00.000Z"),
    featuredReason: "Useful",
    voteCount: 4,
    commentCount: 2,
    claimedTokens: 100,
    status: "released",
    models: ["kimi-k2"],
    kind: "app",
    descriptionMd: "Description",
    scope: "",
    alsoAwesome: false,
    logoKey: "",
    imageKeys: [],
    ...overrides,
  };
}

test("public works cache scope is bounded to anonymous page one", () => {
  assert.deepEqual(
    publicWorksCacheScope({
      awesome: true,
      sort: "hot",
      agents: ["codex", "invalid", "kimi", "codex"],
      kinds: ["skill", "invalid", "app", "skill"],
      scope_: "eco",
    }),
    {
      awesome: true,
      sort: "hot",
      agents: ["kimi", "codex"],
      kinds: ["app", "skill"],
      awesomeScope: "eco",
    },
  );
  assert.deepEqual(
    publicWorksCacheScope({
      awesome: false,
      sort: "not-a-sort",
      agents: ["x".repeat(10_000)],
      kinds: ["not-a-kind"],
      scope_: "part",
    }),
    {
      awesome: false,
      sort: "new",
      agents: [],
      kinds: [],
      awesomeScope: null,
    },
  );
  assert.equal(publicWorksCacheScope({ awesome: false, viewerId: 0 }), null);
  assert.equal(publicWorksCacheScope({ awesome: true, after: "" }), null);
});

test("anonymous works SQL is public and non-hidden before DTO serialization", () => {
  for (const source of ["site", "awesome"] as const) {
    const { sql } = worksPageQuery({ source, sort: "new" });
    assert.match(sql, /w\.visibility = 'public'/);
    assert.match(sql, /w\.hidden_at IS NULL/);
    assert.doesNotMatch(sql, /w\.visibility = 'public' OR w\.user_id/);
  }
});

test("cached work DTO drops non-public rows and contains JSON primitives only", () => {
  const hiddenAt = new Date("2026-08-12T14:00:00.000Z");
  const dto = toPublicWorksPageDto({
    works: [
      work(),
      work({ id: 2, visibility: "private", name: "private sentinel" }),
      work({
        id: 3,
        hiddenAt,
        name: "hidden sentinel",
      }),
    ],
    nextCursor: "1",
  });
  assert.equal(dto.works.length, 1);
  assert.equal(dto.works[0].name, "Public work");
  assert.equal(dto.works[0].createdAt, "2026-08-12T12:00:00.000Z");
  assert.equal(dto.works[0].featuredAt, "2026-08-12T13:00:00.000Z");
  /* WorkRow has three Date-bearing fields: the two public dates round-trip as
     ISO strings, while a non-null hiddenAt makes the whole row ineligible. */
  assert.equal(dto.works[0].hiddenAt, null);
  assert.equal(dto.works[0].hiddenReason, null);
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto);

  const hydrated = hydratePublicWorksPage(dto);
  assert.ok(hydrated.works[0].createdAt instanceof Date);
  assert.ok(hydrated.works[0].featuredAt instanceof Date);
  assert.equal(
    hydrated.works[0].featuredAt?.toISOString(),
    dto.works[0].featuredAt,
  );
});

test("works cache adapter and renderer keep request-dependent work outside", () => {
  const cacheSource = readFileSync(
    new URL("../src/lib/public-works-cache.ts", import.meta.url),
    "utf8",
  );
  const renderer = readFileSync(
    new URL("../app/(app)/works/_components/works-page.tsx", import.meta.url),
    "utf8",
  );
  const dtoSource = readFileSync(
    new URL("../src/lib/public-works.ts", import.meta.url),
    "utf8",
  );
  assert.match(cacheSource, /unstable_cache\(/);
  assert.match(cacheSource, /revalidate: PUBLIC_WORKS_REVALIDATE_SECONDS/);
  assert.match(
    cacheSource,
    /tags: \[PUBLIC_WORKS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG\]/,
  );
  assert.match(cacheSource, /return toPublicWorksPageDto\(page\)/);
  assert.match(
    renderer,
    /publicScope\s*\? await getPublicWorksFirstPage\(publicScope\)/,
  );
  assert.match(renderer, /const \[totals, claimSums\] = scope\.awesome/);
  assert.match(renderer, /new Map<number, number>\(\)/);
  assert.doesNotMatch(cacheSource, /ReactNode|getLocale|getVerifiableTokenTotals|getWorkClaimSums/);
  assert.doesNotMatch(dtoSource, /next\/cache|ReactNode|getLocale|Map<number/);
});

test("work card mutations invalidate the public works tag after successful writes", () => {
  const actions = readFileSync(
    new URL("../app/(app)/works/actions.ts", import.meta.url),
    "utf8",
  );
  for (const action of [
    "createWorkAction",
    "updateWorkAction",
    "deleteWorkAction",
    "featureWorkAction",
    "unfeatureWorkAction",
    "toggleWorkVoteAction",
    "createWorkCommentAction",
    "deleteWorkCommentAction",
  ]) {
    const start = actions.indexOf(`export async function ${action}`);
    const end = actions.indexOf("export async function ", start + 1);
    assert.ok(start >= 0, `${action} is present`);
    assert.match(
      actions.slice(start, end < 0 ? actions.length : end),
      /updateTag\(PUBLIC_WORKS_CACHE_TAG\)/,
      `${action} invalidates cached work cards`,
    );
  }
  const admin = readFileSync(
    new URL("../app/(app)/admin/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(admin, /if \(type === "work"\) updateTag\(PUBLIC_WORKS_CACHE_TAG\)/);
});
