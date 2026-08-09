/* 一页评论 → 两层楼中楼分组(纯函数,详情页与「加载更多」action 共用,测试直接覆盖)。
   输入为一页带 rootId(SQL 已算好可见根)的行,按 (created_at, id) 升序;
   根一定先于其回复出现,输出顶层有序、回复挂在根下,回复记直接父(replyToId)
   供「回复 @xx」标注。 */
export interface CommentTreeRow {
  id: number;
  parentId: number | null;
  rootId: number;
}

export interface CommentTreeNode<T extends CommentTreeRow> {
  comment: T;
  replies: { comment: T; replyToId: number | null }[];
}

export function flattenCommentPage<T extends CommentTreeRow>(
  rows: T[],
): CommentTreeNode<T>[] {
  const threads: CommentTreeNode<T>[] = [];
  const byRoot = new Map<number, CommentTreeNode<T>>();
  for (const r of rows) {
    if (r.id === r.rootId) {
      const node: CommentTreeNode<T> = { comment: r, replies: [] };
      threads.push(node);
      byRoot.set(r.id, node);
      continue;
    }
    const node = byRoot.get(r.rootId);
    if (node) {
      node.replies.push({ comment: r, replyToId: r.parentId });
    } else {
      /* 兜底:根不在本页(理论上不会发生)时按顶层显示,不丢评论 */
      const fallback: CommentTreeNode<T> = { comment: r, replies: [] };
      threads.push(fallback);
      byRoot.set(r.id, fallback);
    }
  }
  return threads;
}
