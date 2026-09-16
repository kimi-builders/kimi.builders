/* Content search endpoint for the ⌘K modal: one request, four grouped
   object families. Public and anonymous — every query is pinned to the
   public visibility predicates (the same contract as list pages), so
   nothing private/hidden/deleted leaks through the modal; query-length
   gate re-checked server-side. Pure helpers (escaping, gate, types)
   live in src/lib/site-content-search.ts and unit-test there. */
import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/src/lib/db";
import {
  contentSearchPattern,
  EMPTY_CONTENT_RESULTS,
  isSearchableQuery,
  type ContentHit,
  type ContentSearchResults,
} from "@/src/lib/site-content-search";

const PER_TYPE_LIMIT = 5;

interface PostRow { id: number; title: string | null; excerpt: string | null }
interface WorkRow { id: number; name: string; tagline: string | null }
interface ArticleRow { slug: string; title: string; summary: string }
interface UserRow { handle: string; name: string | null }

/* Untitled posts carry their meaning in the body; titled posts show
   the title and lead with the body excerpt. */
function postHit(r: PostRow): ContentHit {
  const excerpt = (r.excerpt ?? "").replace(/\s+/g, " ").trim();
  return {
    href: `/community/${r.id}`,
    label: r.title || (excerpt ? excerpt.slice(0, 40) : `#${r.id}`),
    description: r.title && excerpt ? excerpt.slice(0, 72) : "",
  };
}

async function contentSearch(q: string): Promise<ContentSearchResults> {
  const like = contentSearchPattern(q);
  const pool = getPool();
  const [[posts], [works], [articles], [users]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT id, title, LEFT(body_md, 140) AS excerpt
       FROM posts
       WHERE deleted_at IS NULL AND hidden_at IS NULL AND visibility = 'public'
         AND (title LIKE ? OR body_md LIKE ?)
       ORDER BY id DESC LIMIT ${PER_TYPE_LIMIT}`,
      [like, like],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT id, name, tagline
       FROM works
       WHERE hidden_at IS NULL AND visibility = 'public'
         AND (name LIKE ? OR tagline LIKE ?)
       ORDER BY id DESC LIMIT ${PER_TYPE_LIMIT}`,
      [like, like],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT slug, title, summary
       FROM articles
       WHERE deleted_at IS NULL AND published_at IS NOT NULL
         AND (title LIKE ? OR summary LIKE ?)
       ORDER BY updated_at DESC LIMIT ${PER_TYPE_LIMIT}`,
      [like, like],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT handle, name
       FROM users
       WHERE deleted_at IS NULL AND (handle LIKE ? OR name LIKE ?)
       ORDER BY handle LIMIT ${PER_TYPE_LIMIT}`,
      [like, like],
    ),
  ]);
  return {
    posts: (posts as unknown as PostRow[]).map(postHit),
    works: (works as unknown as WorkRow[]).map((r) => ({
      href: `/works/${r.id}`,
      label: r.name,
      description: (r.tagline ?? "").slice(0, 72),
    })),
    articles: (articles as unknown as ArticleRow[]).map((r) => ({
      href: `/explore/${r.slug}`,
      label: r.title,
      description: r.summary.slice(0, 72),
    })),
    users: (users as unknown as UserRow[]).map((r) => ({
      href: `/u/${r.handle}`,
      label: `@${r.handle}`,
      description: r.name ?? "",
    })),
  };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchableQuery(q)) {
    return NextResponse.json(
      { ok: true, ...EMPTY_CONTENT_RESULTS },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const results = await contentSearch(q);
  return NextResponse.json({ ok: true, ...results }, {
    headers: { "Cache-Control": "no-store" },
  });
}
