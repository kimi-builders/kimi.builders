/* Pure JSON DTO boundaries for public right-rail aggregates. Keep rendering,
   locale, session state, and full database rows outside the shared cache. */
import type { FeaturedItem } from "./featured";
import type { SidebarData } from "./posts";
import type { WorkRow } from "./works";

export interface PublicCommunitySidebarDto {
  hot: { id: number; title: string; commentCount: number; score: number }[];
  stats: { members: number; posts: number; comments: number };
  newMembers: { handle: string; avatarUrl: string }[];
}

export function toPublicCommunitySidebarDto(
  data: SidebarData,
): PublicCommunitySidebarDto {
  return {
    hot: data.hot.map((post) => ({
      id: post.id,
      title: post.title,
      commentCount: post.commentCount,
      score: post.score,
    })),
    stats: {
      members: data.stats.members,
      posts: data.stats.posts,
      comments: data.stats.comments,
    },
    newMembers: data.newMembers.map((member) => ({
      handle: member.handle,
      avatarUrl: member.avatarUrl,
    })),
  };
}

export interface PublicFeaturedRailItemDto {
  kind: "post" | "work";
  id: number;
  href: string;
  external: boolean;
  title: string;
  reason: string;
  editorHandle: string;
}

export function toPublicFeaturedRailDto(
  items: FeaturedItem[],
): PublicFeaturedRailItemDto[] {
  /* featuredAt is intentionally omitted: it is used to order in the data
     layer but is not rendered and must not cross the JSON cache boundary. */
  return items.map((item) => ({
    kind: item.kind,
    id: item.id,
    href: item.href,
    external: item.external,
    title: item.title,
    reason: item.reason,
    editorHandle: item.editorHandle,
  }));
}

export interface PublicWorksRailDto {
  stats: {
    works: number;
    authors: number;
    claimedSum: number;
    weeklyNew: number;
  };
  agents: { agent: string; count: number }[];
  kinds: { kind: string; count: number }[];
  top: { id: number; name: string; voteCount: number }[];
}

export function toPublicWorksRailDto(input: {
  stats: PublicWorksRailDto["stats"];
  agents: PublicWorksRailDto["agents"];
  kinds: PublicWorksRailDto["kinds"];
  top: WorkRow[];
}): PublicWorksRailDto {
  return {
    stats: {
      works: input.stats.works,
      authors: input.stats.authors,
      claimedSum: input.stats.claimedSum,
      weeklyNew: input.stats.weeklyNew,
    },
    agents: input.agents.map(({ agent, count }) => ({ agent, count })),
    kinds: input.kinds.map(({ kind, count }) => ({ kind, count })),
    /* The rail only renders these three fields; images, markdown, ownership,
       dates, and moderation fields from WorkRow never enter shared cache. */
    top: input.top.map((work) => ({
      id: work.id,
      name: work.name,
      voteCount: work.voteCount,
    })),
  };
}

export interface PublicAwesomeRailDto {
  stats: {
    items: number;
    agents: number;
    weeklyNew: number;
    recommenders: number;
  };
  scopeStats: { base: number; eco: number; part: number };
  agents: { agent: string; count: number }[];
}

export function toPublicAwesomeRailDto(
  input: PublicAwesomeRailDto,
): PublicAwesomeRailDto {
  return {
    stats: {
      items: input.stats.items,
      agents: input.stats.agents,
      weeklyNew: input.stats.weeklyNew,
      recommenders: input.stats.recommenders,
    },
    scopeStats: {
      base: input.scopeStats.base,
      eco: input.scopeStats.eco,
      part: input.scopeStats.part,
    },
    agents: input.agents.map(({ agent, count }) => ({ agent, count })),
  };
}
