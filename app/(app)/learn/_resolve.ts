/* 知识库 · 站内引用解析与真实数据装配(证据对象化的渲染侧,20260920)。
   ref → 真实对象(标题/链接/署名,作品带声明徽章);对象不存在、已删或
   浏览者不可见 → 该卡降级隐藏(宁缺勿假,不指向空页,无负面标记)。
   这里同时装配详情页的两个真实数据区块:
   · 讨论闭环(RFC §2.5):discussionPostId 指向的社区帖 + 最新 3 条评论;
   · 毕业归因(plan §二.5):source_path = 本路径 slug 的真实毕业作品。 */
import { plainExcerpt } from "@/src/lib/format";
import {
  canViewPost,
  getLatestComments,
  getPost,
  type CommentRow,
  type PostDetail,
} from "@/src/lib/posts";
import { getVerifiableTokenTotals } from "@/src/lib/usage/verifiable";
import {
  canViewWork,
  claimBadgeOf,
  getPathGraduates,
  getWork,
  getWorkClaimSums,
  type WorkRow,
} from "@/src/lib/works";
import type { LearnPath } from "./_data";

type Viewer = { id: number; role: string } | null;

/* 解析成功的引用卡数据(展示时覆盖 mock 的 title/author 占位文案) */
export interface ResolvedRef {
  title: string;
  href: string;
  author: string;
  /* 声明徽章(tokens);null = 不渲染(未声明/超额暂停/awesome 条目) */
  claimBadge: number | null;
}

/* 作品/Awesome 引用的纯判定(DB 之外可单测的部分):
   对象不存在或浏览者不可见 → null(降级隐藏)。 */
export function workRefResolution(
  w: WorkRow | null,
  viewer: Viewer,
  claimBadge: number | null,
): ResolvedRef | null {
  if (!w) return null;
  if (!canViewWork(w, viewer)) return null;
  return {
    title: w.name,
    href: `/works/${w.id}`,
    author: w.handle ? `@${w.handle}` : w.authorLabel,
    claimBadge,
  };
}

/* 社区帖引用的纯判定:同上,帖子无标题时回退正文摘要(同 feed 卡口径)。 */
export function postRefResolution(
  p: PostDetail | null,
  viewer: Viewer,
): ResolvedRef | null {
  if (!p) return null;
  if (!canViewPost(p, viewer)) return null;
  return {
    title: p.title || plainExcerpt(p.bodyMd, 60),
    href: `/community/${p.id}`,
    author: `@${p.handle}`,
    claimBadge: null,
  };
}

/* 一条路径全部 ref 的批量解析:返回 key = "层序:资源序"(渲染层按下标查)。
   声明徽章按作者批量取(可验证总量 + Σ声明,与作品列表同一展示不变式)。 */
export async function resolvePathRefs(
  path: LearnPath,
  viewer: Viewer,
): Promise<Map<string, ResolvedRef | null>> {
  const out = new Map<string, ResolvedRef | null>();
  const workJobs: { key: string; id: number }[] = [];
  const postJobs: { key: string; id: number }[] = [];
  path.levels.forEach((level, i) => {
    level.resources.forEach((r, j) => {
      if (r.external) return;
      const job = { key: `${i}:${j}`, id: r.ref.id };
      if (r.ref.kind === "post") postJobs.push(job);
      else workJobs.push(job); /* work 与 awesome 同在 works 表 */
    });
  });
  const [works, posts] = await Promise.all([
    Promise.all(workJobs.map((job) => getWork(job.id))),
    Promise.all(postJobs.map((job) => getPost(job.id))),
  ]);
  const [totals, sums] = await Promise.all([
    getVerifiableTokenTotals(works.map((w) => w?.userId ?? null)),
    getWorkClaimSums(works.map((w) => w?.userId ?? null)),
  ]);
  workJobs.forEach((job, k) => {
    const w = works[k] ?? null;
    out.set(job.key, workRefResolution(w, viewer, w ? claimBadgeOf(w, totals, sums) : null));
  });
  postJobs.forEach((job, k) => {
    out.set(job.key, postRefResolution(posts[k] ?? null, viewer));
  });
  return out;
}

/* ---- 讨论闭环:路径挂载的社区帖 + 最新讨论 ---- */

export interface PathDiscussion {
  postId: number;
  title: string;
  commentCount: number;
  /* 最新优先(最多 3 条,详见 posts.ts getLatestComments) */
  comments: CommentRow[];
}

/* 帖不存在/已删/对浏览者不可见 → null(讨论区块整体不渲染,同 ref 降级口径)。 */
export async function getPathDiscussion(
  postId: number,
  viewer: Viewer,
): Promise<PathDiscussion | null> {
  const post = await getPost(postId);
  if (!post || !canViewPost(post, viewer)) return null;
  const comments = await getLatestComments(postId, 3);
  return {
    postId,
    title: post.title || plainExcerpt(post.bodyMd, 60),
    commentCount: post.commentCount,
    comments,
  };
}

/* ---- 毕业归因:路径成就区的真实毕业作品 ---- */

export interface GraduateCard {
  work: WorkRow;
  claimBadge: number | null;
}

export async function getPathGraduateCards(
  slug: string,
  limit = 6,
): Promise<GraduateCard[]> {
  const works = await getPathGraduates(slug, limit);
  const [totals, sums] = await Promise.all([
    getVerifiableTokenTotals(works.map((w) => w.userId)),
    getWorkClaimSums(works.map((w) => w.userId)),
  ]);
  return works.map((work) => ({
    work,
    claimBadge: claimBadgeOf(work, totals, sums),
  }));
}
