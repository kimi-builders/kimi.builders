/* 月刊分节分享海报(/api/share/letter/[slug]?section=…)的快照组装层:
   每期月刊的两个数据节(02 事实盘点 / 03 编辑定夺)各自一张 1080×1440 PNG
   (01 本月评鉴是长文,不上海报)。
   写法对齐 ./share-posters:纯函数(参数归一化/截取/快照组装/fixture 映射)与 DB 查询
   分离,路由只取快照再渲染;纯函数直接单测(见 tests/letter-share.test.ts)。
   数据源 = src/lib/monthly 的 getAssembledIssue(组装制,不手写);海报统一中文口径
   (facts 标签走 buildFacts 的 zh 版,同帖子海报 categoryLabel("zh") 的取舍)。
   dev 预览(?preview=1)用 tests/fixtures/monthly-mock 第一期,经 letterSnapshotFromMock
   映射进同一渲染契约 —— 夹具形态与生产 AssembledIssue 不同,映射只此一处。
   20260921:「给官方的信」层随产品转向下线,letter 节海报一并移除。 */
import { normalizeArticleSlug } from "./articles";
import {
  getAssembledIssue,
  type AiDisclosure,
  type AssembledIssue,
  type IssueDecisionKind,
  type IssueFact,
} from "./monthly";
import { POSTER_SITE_ORIGIN, clip, posterInitials } from "./share-posters";

/* ---- 分节参数 ---- */

export type LetterSection = "facts" | "decisions";

export const LETTER_SECTIONS: readonly LetterSection[] = ["facts", "decisions"];

/* ?section= 归一化:缺省 facts,非法值回落 facts(海报路由永不因参数 404)。 */
export function normalizeLetterSection(raw: string | null): LetterSection {
  const s = (raw ?? "").trim().toLowerCase();
  return (LETTER_SECTIONS as readonly string[]).includes(s) ? (s as LetterSection) : "facts";
}

/* aiDisclosure 的分节键与锚一致(facts/decisions);函数保留作映射位。 */
export function disclosureKeyOf(section: LetterSection): keyof AiDisclosure {
  return section;
}

/* ---- 渲染契约 ---- */

/* 定夺卡上限:海报恒满 1440,定夺再多也只上 3 张,余量进「还有 N 条」行。 */
export const LETTER_POSTER_DECISIONS_MAX = 3;

export interface LetterDecisionCard {
  kind: IssueDecisionKind; // chip 配色用
  kindLabel: string; // 生产:精选构建/精选讨论/治理公示;fixture:本月最佳/被低估/治理公示
  title: string;
  authorHandle: string; // 空串 = 治理公示(无单一作者)
  note: string; // 编辑一句话理由(截取)
  editorHandle: string; // 空串 = 不渲染「— @编辑 精选」署名行
}

export interface LetterShareSnapshot {
  slug: string;
  issue: number;
  month: string; // YYYY-MM
  title: string; // 期标题(身份行 name,截取)
  editorHandle: string;
  initials: string;
  section: LetterSection;
  facts: IssueFact[]; // 首项 = hero,其余双列网格;缺项值已是 "—"
  decisions: LetterDecisionCard[]; // ≤ LETTER_POSTER_DECISIONS_MAX
  decisionsMore: number; // 超出上限的剩余定夺数(0 = 全量)
  aiNote: string | null; // 该节 AI 参与披露(截取;null = 该节无披露,不渲染)
  url: string; // 绝对地址 + 分节锚(QR 与页脚共用)
}

/* 生产 kinds → chip 文案(与 blog 详情页 decisionChip 同口径)。 */
export function decisionKindLabel(kind: IssueDecisionKind): string {
  return kind === "work" ? "精选构建" : kind === "post" ? "精选讨论" : "治理公示";
}

function sectionUrl(slug: string, section: LetterSection): string {
  return `${POSTER_SITE_ORIGIN}/blog/${slug}#${section}`;
}

function aiNoteOf(issue: AssembledIssue, section: LetterSection): string | null {
  const note = issue.aiDisclosure?.[disclosureKeyOf(section)];
  return note ? clip(note, 40) : null;
}

/* 整期 → 分节快照(纯):标题/理由截取,定夺截到上限,URL 带节锚。 */
export function buildLetterShareSnapshot(
  issue: AssembledIssue,
  section: LetterSection,
): LetterShareSnapshot {
  return {
    slug: issue.slug,
    issue: issue.issue,
    month: issue.month,
    title: clip(issue.title, 30),
    editorHandle: issue.editorHandle,
    initials: posterInitials("", issue.editorHandle),
    section,
    /* 值截取:TOP 模型等长值(原始 model id)在固定画幅上会溢出;
       全量在站内,海报只取头部 */
    facts: issue.facts.map((f) => ({ label: f.label, value: clip(f.value, 16) })),
    decisions: issue.decisions
      .slice(0, LETTER_POSTER_DECISIONS_MAX)
      .map((d) => ({
        kind: d.kind,
        kindLabel: decisionKindLabel(d.kind),
        title: clip(d.title, 30),
        authorHandle: d.authorHandle,
        note: clip(d.note, 96),
        editorHandle: d.editorHandle,
      })),
    decisionsMore: Math.max(0, issue.decisions.length - LETTER_POSTER_DECISIONS_MAX),
    aiNote: aiNoteOf(issue, section),
    url: sectionUrl(issue.slug, section),
  };
}

/* 无此已发布期(getAssembledIssue null)→ null,路由 404 不渲染(纯函数,可测)。 */
export function letterSnapshotFromResult(
  result: { issue: AssembledIssue } | null,
  section: LetterSection,
): LetterShareSnapshot | null {
  return result ? buildLetterShareSnapshot(result.issue, section) : null;
}

export async function getLetterShareSnapshot(
  slug: string,
  section: LetterSection,
): Promise<LetterShareSnapshot | null> {
  const s = normalizeArticleSlug(slug);
  if (!s) return null;
  return letterSnapshotFromResult(await getAssembledIssue(s, "zh"), section);
}

/* ---- dev 预览:tests/fixtures/monthly-mock 第一期 → 同一渲染契约 ----
   夹具是手写期(类型即需求规格),kinds 词汇与生产不同:best/underrated 是编辑
   定夺的语气,生产 post/work 是来源类型;chip 文案各自保留,配色归到生产 kinds。 */

export interface MockLetterIssue {
  slug: string;
  issue: number;
  month: string;
  title: { zh: string };
  editorHandle: string;
  facts: { label: { zh: string }; value: string }[];
  decisions: {
    kind: "best" | "underrated" | "governance";
    title: { zh: string };
    authorHandle: string;
    note: { zh: string };
  }[];
}

const MOCK_DECISION_KIND: Record<"best" | "underrated" | "governance", IssueDecisionKind> = {
  best: "work",
  underrated: "post",
  governance: "governance",
};

const MOCK_DECISION_LABEL: Record<"best" | "underrated" | "governance", string> = {
  best: "本月最佳",
  underrated: "被低估",
  governance: "治理公示",
};

export function letterSnapshotFromMock(
  issue: MockLetterIssue,
  section: LetterSection,
): LetterShareSnapshot {
  return {
    slug: issue.slug,
    issue: issue.issue,
    month: issue.month,
    title: clip(issue.title.zh, 30),
    editorHandle: issue.editorHandle,
    initials: posterInitials("", issue.editorHandle),
    section,
    facts: issue.facts.map((f) => ({ label: f.label.zh, value: clip(f.value, 16) })),
    decisions: issue.decisions
      .slice(0, LETTER_POSTER_DECISIONS_MAX)
      .map((d) => ({
        kind: MOCK_DECISION_KIND[d.kind],
        kindLabel: MOCK_DECISION_LABEL[d.kind],
        title: clip(d.title.zh, 30),
        authorHandle: d.authorHandle,
        note: clip(d.note.zh, 96),
        /* 夹具无定夺编辑字段,署名到期刊主编(与「定夺到人」纪律一致);
           governance 是公示不是精选,与生产口径一致不落署名行。 */
        editorHandle: d.kind === "governance" ? "" : issue.editorHandle,
      })),
    decisionsMore: Math.max(0, issue.decisions.length - LETTER_POSTER_DECISIONS_MAX),
    aiNote: null,
    url: sectionUrl(issue.slug, section),
  };
}

/* 海报动态文本(供 CJK 粗体子集抓取;静态标签在路由侧拼 LETTER_POSTER_STATIC_TEXT)。
   facts 的 value 也要带上:zh 紧凑格式会出「亿/万」。 */
export function letterShareText(s: LetterShareSnapshot): string {
  return [
    s.title,
    s.initials,
    ...s.facts.flatMap((f) => [f.label, f.value]),
    ...s.decisions.flatMap((d) => [d.kindLabel, d.title, d.authorHandle, d.note]),
    s.aiNote ?? "",
  ].join(" ");
}

/* 本海报全部静态中文标签(漏字会回退动态 400;拉丁/数字走 JetBrains Mono 不列)。
   全角标点(,。:—)也要进子集,否则静态句的标点掉回 400。 */
export const LETTER_POSTER_STATIC_TEXT =
  "事实盘点编辑定夺精选构建讨论治理公示本月最佳被低估" +
  "扫码看本期留空也是记录栏还有条定夺站内查看全部参与披露到人,。:—";
