/* Real-data assembly for the tutorial channel: the discussion loop (the
   series' linked community post + the latest 3 comments) and graduation
   attribution (real graduated works with source_path = this series'
   slug). Missing, deleted, or viewer-invisible objects -> that block
   never renders (better absent than fake). */
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

/* ---- Discussion loop: the series' community post + latest discussion
   ---- */

export interface SeriesDiscussion {
  postId: number;
  title: string;
  commentCount: number;
  /* Newest first (at most 3; see getLatestComments in posts.ts). */
  comments: CommentRow[];
}

/* Post missing/deleted/invisible to the viewer -> null (the discussion
   block never renders). */
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

/* ---- Graduation attribution: the series' real graduated works ---- */

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
