/* One page of comments -> two-level threaded grouping (pure; shared by
   the detail page and the load-more action, covered by tests). Input is a
   page of rows carrying rootId (visible roots already computed in SQL),
   ordered by (created_at, id) ascending; a root always precedes its
   replies. Output: ordered top-level rows with replies attached; replies
   record their direct parent (replyToId) for the "replying @x" label. */
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
      /* Fallback: a root missing from this page (theoretically impossible)
         renders as top-level — comments are never dropped. */
      const fallback: CommentTreeNode<T> = { comment: r, replies: [] };
      threads.push(fallback);
      byRoot.set(r.id, fallback);
    }
  }
  return threads;
}
