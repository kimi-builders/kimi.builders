/* 教程频道的真实数据装配(20260820 教程化改造;自 _resolve.ts 精简平移,
   层级/资源 ref 解析随旧路径结构退役):
   · 讨论闭环(RFC §2.5):系列挂载的社区帖 + 最新 3 条评论;
   · 毕业归因(plan §二.5):source_path = 本系列 slug 的真实毕业作品。
   对象不存在、已删或浏览者不可见 → 对应区块整体不渲染(宁缺勿假)。 */
import { plainExcerpt } from "@/src/lib/format";
import {
  canViewPost,
  getLatestComments,
  getPost,
  type CommentRow,
} from "@/src/lib/posts";
import { getVerifiableTokenTotals } from "@/src/lib/usage/verifiable";
import {
  claimBadgeOf,
  getPathGraduates,
  getWorkClaimSums,
  type WorkRow,
} from "@/src/lib/works";

type Viewer = { id: number; role: string } | null;

/* ---- 讨论闭环:系列挂载的社区帖 + 最新讨论 ---- */

export interface SeriesDiscussion {
  postId: number;
  title: string;
  commentCount: number;
  /* 最新优先(最多 3 条,详见 posts.ts getLatestComments) */
  comments: CommentRow[];
}

/* 帖不存在/已删/对浏览者不可见 → null(讨论区块整体不渲染)。 */
export async function getSeriesDiscussion(
  postId: number,
  viewer: Viewer,
): Promise<SeriesDiscussion | null> {
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

/* ---- 毕业归因:系列页的真实毕业作品 ---- */

export interface GraduateCard {
  work: WorkRow;
  claimBadge: number | null;
}

export async function getSeriesGraduateCards(
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
