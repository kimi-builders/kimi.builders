# Comment style guide

Comments have exactly one audience: the next engineer who changes this code.
Everything below follows from that.

## The rule

**A comment may only say what the code cannot: constraints, invariants,
contracts, hazards, and the reasoning behind non-obvious decisions.**

Code already says *what* happens. Git history and PR descriptions already say
*when* and *why it changed*. A comment that repeats either is noise that will
drift out of sync with the code it describes.

### Write a comment when

- A **constraint** is invisible in the code: ordering requirements, ownership
  of locks/transactions, protocol or API limits, SQL semantics.
- An **invariant** must survive refactors: "placeholders and bound args are
  built from the same array", "notifications only fire after commit".
- There is a **hazard** the next reader would otherwise trip over: a library
  quirk, a 500-on-crafted-input bug class, a header that can be forged.
- A **decision** looks wrong without its context: why a coarse value beats a
  precise-but-forgeable one, why an empty array is worse than no array.

### Never write

- **Narration** of what the next lines do (`/* validate, then write */`).
- **Change history**: dates, ticket IDs, "previously we did X, now we do Y".
  That belongs in the commit message. The `20260822 P2-5` tags from the old
  style are being removed — do not add new ones.
- **Change justification** ("fixed: ...", addresses reviewer comments). That
  is a PR description talking to a reviewer, not to the next reader.
- **Restating** a signature, a type, or an obvious SQL clause.

If a comment narrates, delete it. If it carries a constraint, rewrite it to
lead with the constraint.

## Form

### File headers

One block, 1–6 lines, present tense: what this module is, its contract, and
any hazard that shapes every line below. No history, no dates.

```ts
/* Shared cache for anonymous community-feed page 1 only. cacheComponents is
   intentionally disabled in this app, so this remains on unstable_cache.
   The callback receives only bounded public scope and returns a JSON-only DTO. */
```

(Real examples to imitate: `src/lib/public-feed-cache.ts`, `src/lib/cache-tags.ts`.)

### Inline comments

One idea per comment. Lead with the rule, not the story behind it:

```ts
// Placeholders and bound args must be built from the same array; generating
// them from different lengths once 500'd whole pages on crafted URLs.
```

### Exported functions in src/lib

The data layer is the project's public contract — a short doc comment on
non-trivial exports stating what a caller must know: parameter semantics,
what a `null` / `false` return means, side effects, transaction boundaries.
Skip it for trivial helpers; a redundant comment is worse than none.

## Mechanics

- **English only.** User-facing copy is bilingual by design and lives in the
  i18n dictionary (`src/lib/i18n.ts`) as zh/en pairs — never in comments.
- Sentence case, imperative mood, terminated sentences. Wrap around column 76.
- `//` for single-line, `/* ... */` for file headers and multi-line blocks
  (matches existing style).
- `TODO` must reference a GitHub issue (`TODO(#123): ...`). Bare TODOs rot.
- Chinese-language internals stay out of code comments: workspace agent
  instructions live in `AGENTS.md`, private ops notes in `local-dev-docs/`
  (untracked).

## Enforcement

`tests/comment-language.test.ts` ratchets the migration:

- Per-area counts of comment lines containing CJK must never exceed the
  snapshot in `tests/comment-baseline.json` (regenerate deliberately with
  `UPDATE_BASELINE=1 npm test` when a conversion lands).
- Files listed as `locked` must contain zero CJK comment lines, forever.

New code: write English comments; the ratchet fails CI otherwise.

## Terminology

Use these translations consistently (old Chinese term → canonical English):

| 中文 | English |
|---|---|
| 可见性谓词 | visibility predicate |
| 固定窗口限流 | fixed-window rate limit |
| 游标分页 / 键集分页 | keyset pagination |
| 帖子/作品精选 | featured (posts/works) |
| 屏蔽 / 隐藏 | hidden (moderation), `hidden_at` |
| 软删 | soft delete |
| 禁言 | mute |
| 召唤 | summon (@kimi) |
| 楼中楼 | threaded comments |
| 期 / 月刊 | issue / monthly letter |
| 系列 | series |
| 章主轴(学/做/得/立) | chapters (learn/build/measure/establish) |
| 透镜(下拉筛选维度) | lens (dropdown filter dimension) |
| 宁弱不豆腐 | prefer weak fallback over tofu (missing glyphs) |
| 地盘规则 | territory rule (content owner's AI switch wins) |
