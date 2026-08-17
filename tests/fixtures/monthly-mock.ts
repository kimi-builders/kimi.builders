/* 月刊 mock 夹具:原 app/(app)/blog/_data.ts 的模拟期次(20260920 组装制接真后移入;
   20260921 产品转向:「给官方的信」层下线,夹具同步摘除 agenda/response)。
   用途 = 组装函数的测试样本 ——「类型即需求规格」的正确归宿
   (plan-monthly-learn-launch.md §一.1:mock 数据整体移入 tests/fixtures)。
   生产仅一处引用:海报路由的 dev-only 预览分支(?preview=1,NODE_ENV=development,
   动态 import,不进生产渲染路径);渲染契约的真实形态见 src/lib/monthly.ts。 */

/* 与 app/(app)/learn/_data.ts 的 L10n 同形;这里独立定义,夹具不依赖生产文件。 */
export interface L10n {
  zh: string;
  en: string;
}

export interface IssueFact {
  label: L10n;
  value: string;
}

export interface IssueDecision {
  kind: "best" | "underrated" | "governance";
  title: L10n;
  authorHandle: string;
  /* 编辑一句话理由:定夺可见 */
  note: L10n;
}

export interface BlogIssue {
  slug: string;
  issue: number;
  month: string;
  title: L10n;
  summary: L10n;
  editorHandle: string;
  facts: IssueFact[];
  decisions: IssueDecision[];
}

export const BLOG_ISSUES: BlogIssue[] = [
  {
    slug: "letter-2026-08",
    issue: 3,
    month: "2026-08",
    title: {
      zh: "第三期:缓存的经济账,与本月值得读的七条链接",
      en: "Issue 3: the economics of caching, and seven links worth your time",
    },
    summary: {
      zh: "本月全站缓存命中率首次越过 80%,省下的是真金白银;评鉴栏选读了七条 Kimi 生态与 AI 世界的好内容;编辑部选出两件值得被看见的构建。",
      en: "Site-wide cache hit rate crossed 80% — real money saved. Seven reads worth your time from the Kimi ecosystem and beyond, plus two builds worth your attention.",
    },
    editorHandle: "aklman",
    facts: [
      { label: { zh: "本月同步 Token", en: "Tokens synced this month" }, value: "2.4B" },
      { label: { zh: "活跃 builder", en: "Active builders" }, value: "87" },
      { label: { zh: "新增作品", en: "New works" }, value: "23" },
      { label: { zh: "缓存命中率", en: "Cache hit rate" }, value: "81.3%" },
    ],
    decisions: [
      {
        kind: "best",
        title: { zh: "Lunar Orbit:月轨可视化周历", en: "Lunar Orbit: an orbital weekly calendar" },
        authorHandle: "moonwalker",
        note: {
          zh: "构建过程消耗 4.2M token(已验证)。选它不只因为完成度:这是本月唯一一件把「失败三次」写进发布说明的作品。",
          en: "4.2M tokens of verified build effort. Chosen not just for polish — it's the only work this month that put “failed three times” in its release notes.",
        },
      },
      {
        kind: "underrated",
        title: { zh: "给猫粮库存做的极简预测器", en: "A minimalist predictor for cat food inventory" },
        authorHandle: "lin_builds",
        note: {
          zh: "14 颗星、零转发,但代码是本月最干净的。被低估的定义:值得更多注意力而注意力还没到。",
          en: "14 stars, zero reshares, and the cleanest code of the month. Underrated means: the attention owed hasn't arrived yet.",
        },
      },
      {
        kind: "governance",
        title: { zh: "治理公示:两起 AI 冒充人类评论的裁定", en: "Governance: two rulings on AI posing as human comments" },
        authorHandle: "pipe_dreamer",
        note: {
          zh: "均裁定删除并公示。规则没有覆盖「AI 代写但不披露」的情况——本次按署名真实性的既有原则扩张解释,过程全文公开。",
          en: "Both removed and published. The rules didn't cover undisclosed AI ghostwriting; we extended the authorship-truth principle, full reasoning disclosed.",
        },
      },
    ],
  },
  {
    slug: "letter-2026-07",
    issue: 2,
    month: "2026-07",
    title: {
      zh: "第二期:开源模型月,与多 Agent 混用的拐点",
      en: "Issue 2: the open-models month, and the multi-agent tipping point",
    },
    summary: {
      zh: "本月事实:多 Agent 混用成为主流用法,单一 Agent 用户首次跌破一半;评鉴栏追了 Kimi K3 发布后的连锁反应。",
      en: "This month's facts: multi-agent workflows became the majority — single-agent users dropped below half for the first time. The review followed the Kimi K3 ripple effects.",
    },
    editorHandle: "moonwalker",
    facts: [
      { label: { zh: "本月同步 Token", en: "Tokens synced this month" }, value: "1.1B" },
      { label: { zh: "多 Agent 用户占比", en: "Multi-agent users" }, value: "54%" },
      { label: { zh: "新增作品", en: "New works" }, value: "17" },
      { label: { zh: "最常用模型", en: "Top model" }, value: "kimi-latest · 41%" },
    ],
    decisions: [
      {
        kind: "best",
        title: { zh: "Weeklog:把 Agent 会话变成可检索的周报", en: "Weeklog: turning agent sessions into a searchable weekly report" },
        authorHandle: "echo_five",
        note: {
          zh: "解决的是所有人都有但没人命名的问题:「这周我到底干了什么」。用量 1.8M token,已验证。",
          en: "It solves a problem everyone has and nobody named: “what did I actually do this week?” 1.8M verified tokens of build effort.",
        },
      },
      {
        kind: "underrated",
        title: { zh: "一行命令的 PNG 压缩机器人", en: "A one-command PNG compression bot" },
        authorHandle: "cost_watcher",
        note: {
          zh: "小到没有存在感,但社区里有 9 个项目已经用上。影响力和声量不成比例,正是这个栏位存在的意义。",
          en: "Tiny, quiet — and already inside 9 community projects. Impact outrunning reach is exactly what this slot is for.",
        },
      },
    ],
  },
  {
    slug: "letter-2026-06",
    issue: 1,
    month: "2026-06",
    title: {
      zh: "创刊号:我们是谁,这份月刊怎么读",
      en: "Issue 1: who we are, and how to read this monthly",
    },
    summary: {
      zh: "非官方社区的第一份月度评鉴:本月社区同步了 460M token,发布了 11 件作品;三条底线从这一期开始:署名到人、AI 参与必披露、事实可复算。",
      en: "The unofficial community's first monthly review: 460M tokens synced, 11 works shipped. Three baselines from day one: signed by humans, AI involvement disclosed, facts reproducible.",
    },
    editorHandle: "aklman",
    facts: [
      { label: { zh: "本月同步 Token", en: "Tokens synced this month" }, value: "460M" },
      { label: { zh: "社区成员", en: "Members" }, value: "203" },
      { label: { zh: "新增作品", en: "New works" }, value: "11" },
      { label: { zh: "评鉴选读", en: "Reviewed picks" }, value: "9" },
    ],
    decisions: [
      {
        kind: "governance",
        title: { zh: "创刊章程:署名、披露与事实可复算", en: "Founding charter: signature, disclosure, reproducible facts" },
        authorHandle: "aklman",
        note: {
          zh: "三条底线:内容署名到人;AI 参与必须披露;事实层每一个数字都能复算。本刊的存在不依赖任何人的许可。",
          en: "Three baselines: humans sign the content; AI involvement is disclosed; every number in the facts layer is reproducible. This monthly's existence depends on nobody's permission.",
        },
      },
    ],
  },
];

export function findBlogIssue(slug: string): BlogIssue | undefined {
  return BLOG_ISSUES.find((i) => i.slug === slug);
}
