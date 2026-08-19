/* 知识库 · 学习路径数据模块 v2(20260816 二轮重设计;20260920 机械结构改造)
   ⚠️ MOCK:设计期模拟数据,外链为占位示例;站内 ref 的 id 全部为占位 0
   (真实对象 id 无法预知),渲染层解析不到对象即降级隐藏——内容运营时
   逐条替换为真实对象 id 并整体替换数据源,本模块的类型即需求规格。
   路径 = 若干 Level(层)的旅程;每层含资源卡(外部一手资料/社区笔记,
   尽可能不自产内容)+ You'll Learn 要点 + Optional Branches 可选支线
   (「标题 — 类型 · 来源」);路径终点是成就徽章 + 毕业物上墙。

   验证戳(RFC §2.2):editorHandle × verifiedModel × verifiedAt;
   stale 不手填,由 isPathStale 计算(超龄或模型换代 → 待重验)——
   验证戳必须自己不会过期说谎;reverifyLog 留每次重验的痕迹。
   证据对象化(RFC §2.3):evidence 类资源强制站内 ref(类型层钉死),
   外部一手资料走 href,两者互斥(可判别联合)。
   讨论闭环(RFC §2.5):discussionPostId 挂社区帖(运营发帖后回填,
   mock 先全部不配置)。 */

export type ResourceKind =
  | "official"
  | "video-youtube"
  | "video-bilibili"
  | "post-x"
  | "note"
  | "evidence";

export interface L10n {
  zh: string;
  en: string;
}

/* 站点当前担保的模型代际(验证戳的对照基准)。
   ⚠️ 模型换代时更新此值:更新瞬间,所有 verifiedModel ≠ 此值的路径
   自动转「待重验」(K-3.1 作战日历 T+1 ~ T+7 的机械触发)。 */
export const CURRENT_KIMI_MODEL = "kimi-latest";

/* 验证戳保质期:verifiedAt 超过该天数未重验 → 自动「待重验」(plan §二.1,建议 45 天)。 */
export const STALE_AFTER_DAYS = 45;

/* 计算型 stale(纯函数):验证戳必须自己不会过期说谎。
   · verifiedModel ≠ 当前模型代际 → 待重验;
   · verifiedAt(YYYY-MM[-DD])距今超 STALE_AFTER_DAYS → 待重验;
   · verifiedAt 无法解析 → 待重验(读不出的戳不担保)。 */
export function isPathStale(
  path: { verifiedModel: string; verifiedAt: string },
  currentModel: string = CURRENT_KIMI_MODEL,
  now: Date = new Date(),
): boolean {
  if (path.verifiedModel !== currentModel) return true;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(path.verifiedAt.trim());
  if (!m) return true;
  const month = Number(m[2]);
  const day = Number(m[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return true;
  const verified = Date.UTC(Number(m[1]), month - 1, day);
  return now.getTime() - verified > STALE_AFTER_DAYS * 86_400_000;
}

/* 重验记录(RFC §2.2):每次重验留痕——时间 × 模型 × 编辑注记,新的在前。
   最新一次重验同时更新 verifiedAt/verifiedModel;log 是它之前的痕迹。 */
export interface ReverifyEntry {
  at: string;
  model: string;
  note: L10n;
}

/* 站内引用(证据对象化,RFC §2.3):指向真实对象而非手抄链接——
   作品 / 社区帖 / Awesome 条目。渲染层解析成真实标题、链接与署名
   (作品带声明徽章);对象删除或不可见时该卡降级隐藏,不指向空页。 */
export interface ResourceRef {
  kind: "work" | "post" | "awesome";
  id: number;
}

interface PathResourceBase {
  kind: ResourceKind;
  /* 封面角标(mono 短码):DOC / YT / BILI / X / NOTE / EV */
  code: string;
  title: L10n;
  /* 讲者/作者/UP主;
     ref 卡解析成功后以真实对象的署名覆盖展示,mock 文案是策展意图 */
  author: L10n;
  duration: L10n;
  /* 编辑为什么选它:定夺必须可见,不藏进 hover */
  why: L10n;
}

/* 资源卡:路径内的一个学习对象。可判别联合,二选一——
   · 外部一手资料:external: true + href(官方文档/视频/推串,出站);
   · 站内引用:external: false + ref(对象化,渲染层解析;对象没了卡片降级)。
   evidence 类资源强制 ref(类型层钉死:证据必须指向站内真实对象)。 */
export type PathResource =
  | (PathResourceBase & {
      kind: "evidence";
      external: false;
      ref: ResourceRef;
      href?: never;
    })
  | (PathResourceBase & {
      kind: Exclude<ResourceKind, "evidence">;
      external: true;
      href: string;
      ref?: never;
    })
  | (PathResourceBase & {
      kind: Exclude<ResourceKind, "evidence">;
      external: false;
      ref: ResourceRef;
      href?: never;
    });

/* 可选支线:不占主线,给想深入的人 */
export interface PathBranch {
  title: L10n;
  /* 「类型 · 来源」,如「文档 · 官方」「视频 · YouTube」 */
  meta: L10n;
  href: string;
  external: boolean;
}

export interface PathLevel {
  name: L10n;
  desc: L10n;
  learn: L10n[];
  hours: number;
  resources: PathResource[];
  branches: PathBranch[];
}

export interface LearnPath {
  slug: string;
  code: string;
  tier: "starter" | "builder";
  variant: "journey" | "editorial";
  title: L10n;
  /* hero 金句*/
  tagline: L10n;
  summary: L10n;
  editorHandle: string;
  verifiedModel: string;
  verifiedAt: string;
  /* stale 已改为计算(isPathStale),不在数据里手填 */
  reverifyLog: ReverifyEntry[];
  /* 讨论闭环(RFC §2.5,零新评论系统):每条路径挂一条社区帖,路径页显示
     最新 3 条讨论 + 「去讨论」入口。运营发「PATH-XX 讨论帖」后把 post id
     回填到这里;未配置不渲染讨论区块(mock 先全部不配置)。 */
  discussionPostId?: number;
  hours: number;
  levels: PathLevel[];
  achievement: { title: L10n; note: L10n };
}

/* ⚠️ mock 内全部 ref.id = 0(占位:真实对象 id 无法预知)。渲染层解析不到
   对象即降级隐藏该卡;内容运营时逐条策展替换为真实作品/帖子/Awesome 条目
   (plan-monthly-learn-launch §二.3:宁缺勿假)。 */
export const LEARN_PATHS: LearnPath[] = [
  {
    slug: "first-build-with-kimi",
    code: "PATH-01",
    tier: "starter",
    variant: "journey",
    title: { zh: "从零到第一个 Kimi 作品", en: "From zero to your first Kimi build" },
    tagline: {
      zh: "知道路径，和走上路径，是两回事。",
      en: "There's a difference between knowing the path, and walking the path.",
    },
    summary: {
      zh: "面向第一次用 Kimi 做东西的 builder：三层旅程——官方一手资料起步、真实走通的人带路上路、发布毕业。终点不是「学会了」，是「发出来了」。",
      en: "For first-time builders: a three-level journey — start from official material, follow people who actually shipped, graduate by publishing. The endpoint isn't “learned”, it's “shipped”.",
    },
    editorHandle: "aklman",
    verifiedModel: "kimi-latest",
    verifiedAt: "2026-08",
    reverifyLog: [
      {
        at: "2026-07",
        model: "kimi-latest",
        note: {
          zh: "官方入门页改版后重验「起步」层，链接与口径同步更新。",
          en: "Re-verified the Fundamentals level after the official getting-started page redesign.",
        },
      },
    ],
    hours: 6,
    levels: [
      {
        name: { zh: "起步", en: "The Fundamentals" },
        desc: {
          zh: "从官方口径开始：能做什么、怎么开始、完整构建长什么样。这一层只认一手资料。",
          en: "Start with the official framing: what it can do, how to begin, what a full build looks like. First-party only in this level.",
        },
        learn: [
          { zh: "官方口径的起点", en: "The official baseline" },
          { zh: "一次完整的构建演示", en: "One complete build, on camera" },
        ],
        hours: 2,
        resources: [
          {
            kind: "official",
            code: "DOC",
            title: { zh: "Kimi 官方入门：能做什么，怎么开始", en: "Kimi official getting started" },
            author: { zh: "Kimi 官方文档", en: "Kimi official docs" },
            href: "https://platform.moonshot.ai/docs/getting-started",
            external: true,
            duration: { zh: "约 20 分钟", en: "~20 min read" },
            why: {
              zh: "起点只认官方：口径以官方为准，二手转述一概不进路径。",
              en: "First-party only for step one; secondhand retellings never enter the path.",
            },
          },
          {
            kind: "video-bilibili",
            code: "BILI",
            title: { zh: "官方演示：10 分钟做出一个可用小工具", en: "Official demo: a usable tool in 10 minutes" },
            author: { zh: "bilibili · Kimi 官方", en: "bilibili · Kimi official" },
            href: "https://www.bilibili.com/video/BV1kimi001",
            external: true,
            duration: { zh: "12 分钟", en: "12 min" },
            why: {
              zh: "官方出镜的完整构建过程，比任何教程文字都诚实——包括卡住的地方。",
              en: "A full build on camera, more honest than any tutorial prose — stuck moments included.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "Kimi 官方速查表", en: "Kimi official cheatsheet" },
            meta: { zh: "文档 · 官方", en: "Doc · Official" },
            href: "https://platform.moonshot.ai/docs/cheatsheet",
            external: true,
          },
          {
            title: { zh: "提问的智慧（经典长文）", en: "How To Ask Questions The Smart Way" },
            meta: { zh: "文章 · 经典", en: "Post · Classic" },
            href: "http://www.catb.org/~esr/faqs/smart-questions.html",
            external: true,
          },
        ],
      },
      {
        name: { zh: "上路", en: "Hit The Road" },
        desc: {
          zh: "选题观比操作步骤更稀缺。这一层跟着真实走通的人学：他们怎么选题、怎么返工、怎么发出来。",
          en: "Topic selection is scarcer than mechanics. This level follows people who shipped: how they chose, reworked, and published.",
        },
        learn: [
          { zh: "选题优先于教程", en: "Topics before tutorials" },
          { zh: "返工是常态，不是失败", en: "Rework is the norm" },
        ],
        hours: 3,
        resources: [
          {
            kind: "post-x",
            code: "X",
            title: { zh: "「别从 Hello World 开始，从你今天就想用的东西开始」", en: "“Don't start with Hello World — start with what you want to use today”" },
            author: { zh: "X · @ship_first", en: "X · @ship_first" },
            href: "https://x.com/ship_first/status/1800000000000000001",
            external: true,
            duration: { zh: "长推串 · 8 分钟", en: "thread · 8 min" },
            why: {
              zh: "被引用最多的选题观：毕业物优先。这条推串把它讲透了。",
              en: "The most-cited take on topic selection: ship first. This thread nails it.",
            },
          },
          {
            kind: "note",
            code: "NOTE",
            title: { zh: "学习笔记：我用 Kimi 做出了第一个作品（踩坑全记录）", en: "Learning note: my first Kimi build, mistakes included" },
            author: { zh: "社区 · @lin_builds", en: "community · @lin_builds" },
            ref: { kind: "post", id: 0 }, // 占位 id,运营替换为真实社区帖
            external: false,
            duration: { zh: "长文 · 15 分钟", en: "long read · 15 min" },
            why: {
              zh: "真实全程笔记，含三次返工——我们验证过，这条路走得起。",
              en: "A real first-timer's log with three reworks — we verified the path is walkable.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "Awesome：别人用 Kimi 做了什么", en: "Awesome: what others built with Kimi" },
            meta: { zh: "清单 · 社区", en: "List · Community" },
            href: "/awesome",
            external: false,
          },
        ],
      },
      {
        name: { zh: "毕业", en: "Graduation" },
        desc: {
          zh: "把你的第一个作品发上作品墙——即毕业。可被每周精选收录，进入认证候选。",
          en: "Post your first build to the works wall — that's graduation. Eligible for the weekly featured picks and certification.",
        },
        learn: [
          { zh: "发布即毕业", en: "Publishing is graduating" },
          { zh: "被看见，被精选，被认证", en: "Seen, featured, certified" },
        ],
        hours: 1,
        resources: [
          {
            kind: "evidence",
            code: "EV",
            title: { zh: "终点：这条路毕业的作品长什么样", en: "Endpoint: what graduates of this path shipped" },
            author: { zh: "作品墙 · 本路径毕业生", en: "works wall · path graduates" },
            ref: { kind: "work", id: 0 }, // 占位 id,运营替换为本路径真实毕业作品
            external: false,
            duration: { zh: "浏览", en: "browse" },
            why: {
              zh: "每条路径以真实终点收口：不是「学会了」，是「发出来了」。",
              en: "Every path ends at a real artifact: not “learned it” but “shipped it”.",
            },
          },
          {
            kind: "evidence",
            code: "EV",
            title: { zh: "发布你的第一个作品", en: "Publish your first work" },
            author: { zh: "作品墙 · 提交入口", en: "works wall · submission" },
            ref: { kind: "work", id: 0 }, // 占位 id,运营替换为真实作品
            external: false,
            duration: { zh: "动手", en: "hands-on" },
            why: {
              zh: "毕业物闭环：发出来，才算走完。构建过程用量可同步验证。",
              en: "The graduation loop: it counts when it's shipped. Build effort can carry verified usage.",
            },
          },
        ],
        branches: [],
      },
    ],
    achievement: {
      title: { zh: "「首次发布」", en: "“First Ship”" },
      note: {
        zh: "完成本路径即解锁徽章：你的第一个作品挂上作品墙，进入每周精选候选。",
        en: "Complete this path to unlock the badge: your first work on the wall, eligible for the weekly featured picks.",
      },
    },
  },
  {
    slug: "kimi-code-agent-workflows",
    code: "PATH-02",
    tier: "builder",
    variant: "journey",
    title: { zh: "Kimi Code：Agent 工作流实战", en: "Kimi Code: agent workflows in practice" },
    tagline: {
      zh: "让 Agent 干活之前，先想清楚你交付给它什么。",
      en: "Before you let the agent work, decide what you're handing over.",
    },
    summary: {
      zh: "已经会用 Kimi 对话，进入「让 Agent 干活」的阶段：权限地基 → 真实仓库实战 → 工具链收口，全程社区实测笔记带路。",
      en: "Past chatting, into delegating: permission foundations, real-repo practice, and a toolchain close-out, guided by field-tested community notes.",
    },
    editorHandle: "moonwalker",
    verifiedModel: "kimi-latest",
    verifiedAt: "2026-08",
    reverifyLog: [],
    hours: 10,
    levels: [
      {
        name: { zh: "权限与地基", en: "Permissions & Foundations" },
        desc: {
          zh: "Agent 安全的地基是权限模型。这一层只放官方文档与社区的安全实践帖。",
          en: "The permission model is the foundation of agent safety. Official docs and community safety practice only.",
        },
        learn: [
          { zh: "权限模型与边界", en: "The permission model" },
          { zh: "什么时候必须人审", en: "When a human must review" },
        ],
        hours: 3,
        resources: [
          {
            kind: "official",
            code: "DOC",
            title: { zh: "Kimi Code 官方文档：Agent 模式与权限模型", en: "Kimi Code docs: agent mode & permissions" },
            author: { zh: "Kimi 官方文档", en: "Kimi official docs" },
            href: "https://platform.moonshot.ai/docs/kimi-code",
            external: true,
            duration: { zh: "约 35 分钟", en: "~35 min read" },
            why: {
              zh: "全网唯一权威版本：权限这页，转述一律不收。",
              en: "The only authoritative version; paraphrases not accepted on permissions.",
            },
          },
          {
            kind: "note",
            code: "NOTE",
            title: { zh: "实战笔记：我让 Agent 接管了 CI 修复", en: "Field note: I let the agent own CI fixes" },
            author: { zh: "社区 · @pipe_dreamer", en: "community · @pipe_dreamer" },
            ref: { kind: "post", id: 0 }, // 占位 id,运营替换为真实社区帖
            external: false,
            duration: { zh: "长文 · 18 分钟", en: "long read · 18 min" },
            why: {
              zh: "把边界条件写成守则的示范：什么时候放手、什么时候必须人审。",
              en: "A model of guardrails-as-rules: when to let go, when to review.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "最小权限原则（Wikipedia）", en: "Principle of least privilege" },
            meta: { zh: "词条 ·维基", en: "Ref · Wikipedia" },
            href: "https://en.wikipedia.org/wiki/Principle_of_least_privilege",
            external: true,
          },
        ],
      },
      {
        name: { zh: "真实仓库实战", en: "Real-Repo Practice" },
        desc: {
          zh: "看真实仓库里的完整 Agent 协作：不剪辑的失败、两周的用量账本、效率的算术。",
          en: "Full agent collaboration in real repos: uncut failures, a two-week usage ledger, the arithmetic of efficiency.",
        },
        learn: [
          { zh: "长任务的分段与回收", en: "Segmenting long tasks" },
          { zh: "用量与效率的算术", en: "The arithmetic of usage" },
        ],
        hours: 5,
        resources: [
          {
            kind: "video-youtube",
            code: "YT",
            title: { zh: "Deep dive：一个真实仓库里的 Agent 重构全程", en: "Deep dive: a full agent refactor in a real repo" },
            author: { zh: "YouTube · @agentfield", en: "YouTube · @agentfield" },
            href: "https://www.youtube.com/watch?v=kimi-agent-01",
            external: true,
            duration: { zh: "48 分钟", en: "48 min" },
            why: {
              zh: "少见的「不剪辑失败」长录：能看清什么时候该收回控制权。",
              en: "A rare uncut long take: you can see when to take the wheel back.",
            },
          },
          {
            kind: "note",
            code: "NOTE",
            title: { zh: "实战笔记：两周 Agent 协作的用量与效率账本", en: "Field note: the token & efficiency ledger of two agent weeks" },
            author: { zh: "社区 · @aklman", en: "community · @aklman" },
            ref: { kind: "post", id: 0 }, // 占位 id,运营替换为真实社区帖
            external: false,
            duration: { zh: "长文 · 20 分钟", en: "long read · 20 min" },
            why: {
              zh: "作者公开了自己的用量数据（站内已验证），把「值不值」算成了账。",
              en: "Published verified usage data — turning “worth it?” into arithmetic.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "构建叙事：Lunar Orbit 的三次返工", en: "Build story: Lunar Orbit's three reworks" },
            meta: { zh: "作品 · 社区", en: "Work · Community" },
            href: "/works",
            external: false,
          },
        ],
      },
      {
        name: { zh: "工具链收口", en: "Toolchain Close-Out" },
        desc: {
          zh: "走完这条路的人做出的东西，大多能在这份清单里找到。带着你的问题去翻，比从头读更有用。",
          en: "What people built after this path mostly lives in this list. Browse with your problem in hand — more useful than reading end to end.",
        },
        learn: [
          { zh: "按问题找工具，不按清单学工具", en: "Find tools by problem, not by list" },
        ],
        hours: 2,
        resources: [
          {
            kind: "evidence",
            code: "EV",
            title: { zh: "终点：Awesome 收录的 Kimi 工具链与项目", en: "Endpoint: the Kimi toolchain on Awesome" },
            author: { zh: "Awesome 清单 · 社区共建", en: "Awesome list · community" },
            ref: { kind: "awesome", id: 0 }, // 占位 id,运营替换为真实 Awesome 条目
            external: false,
            duration: { zh: "浏览", en: "browse" },
            why: {
              zh: "证据终点：这条路的产物清单，收录标准公开。",
              en: "Evidence endpoint: the artifact list of this path, with public inclusion criteria.",
            },
          },
        ],
        branches: [],
      },
    ],
    achievement: {
      title: { zh: "「Agent 指挥官」", en: "“Agent Commander”" },
      note: {
        zh: "完成本路径即解锁徽章：你的 Agent 工作流笔记被收录进路径时，署名归你。",
        en: "Complete this path to unlock the badge: when your workflow notes enter the path, they carry your name.",
      },
    },
  },
  {
    slug: "designing-with-kimi",
    code: "PATH-03",
    tier: "starter",
    variant: "journey",
    title: { zh: "协作设计：把 Kimi 当同事，不当搜索引擎", en: "Designing with Kimi: colleague, not search engine" },
    tagline: {
      zh: "提示词不是咒语，是工作简报。",
      en: "A prompt isn't an incantation — it's a brief.",
    },
    summary: {
      zh: "上下文工程 → 迭代方法 → 产物证据：三层走完「和 Kimi 一起把东西做好」的方法论，全部一手与实录。",
      en: "Context engineering → iteration method → artifact evidence: the methodology of building well with Kimi, first-party and on-record throughout.",
    },
    editorHandle: "lin_builds",
    verifiedModel: "kimi-latest",
    /* 2026-08 重验通过(计算型 stale 上线前本已过 45 天保质期,编辑重走后更新戳) */
    verifiedAt: "2026-08",
    reverifyLog: [
      {
        at: "2026-08",
        model: "kimi-latest",
        note: {
          zh: "保质期将满，编辑重走三层后更新验证戳。",
          en: "Routine re-verification before the stamp's 45-day shelf life expired.",
        },
      },
    ],
    hours: 4,
    levels: [
      {
        name: { zh: "上下文工程", en: "Context Engineering" },
        desc: {
          zh: "把「给足上下文」当工程问题做，而不是玄学。",
          en: "Treat context as an engineering problem, not mysticism.",
        },
        learn: [
          { zh: "上下文的给法", en: "How to supply context" },
          { zh: "约束写成规格", en: "Constraints as specs" },
        ],
        hours: 1,
        resources: [
          {
            kind: "official",
            code: "DOC",
            title: { zh: "官方指南：与 Kimi 协作的上下文设计", en: "Official guide: designing context with Kimi" },
            author: { zh: "Kimi 官方文档", en: "Kimi official docs" },
            href: "https://platform.moonshot.ai/docs/collaboration",
            external: true,
            duration: { zh: "约 25 分钟", en: "~25 min read" },
            why: {
              zh: "把协作讲成工程问题的，只有这一篇。",
              en: "The only piece that frames collaboration as engineering.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "@kimi 召唤的最佳实践（社区帖）", en: "@kimi summon best practices (community)" },
            meta: { zh: "帖子 · 社区", en: "Post · Community" },
            href: "/community",
            external: false,
          },
        ],
      },
      {
        name: { zh: "迭代方法", en: "Iteration Method" },
        desc: {
          zh: "方法在迭代里，不在第一条提示词里：一次需求，五轮对话，完整演进。",
          en: "The method lives in the iterations, not the first prompt: one requirement, five rounds, full evolution.",
        },
        learn: [
          { zh: "简报式任务描述", en: "Brief-style tasking" },
          { zh: "迭代留痕与复盘", en: "Iteration trails & review" },
        ],
        hours: 2,
        resources: [
          {
            kind: "post-x",
            code: "X",
            title: { zh: "「我不再写提示词，我写工作简报」", en: "“I stopped writing prompts — I write briefs”" },
            author: { zh: "X · @brief_writer", en: "X · @brief_writer" },
            href: "https://x.com/brief_writer/status/1800000000000000002",
            external: true,
            duration: { zh: "长推串 · 10 分钟", en: "thread · 10 min" },
            why: {
              zh: "被引用最多的协作观，恰好是社区 @kimi 召唤的最佳实践。",
              en: "The most-cited collaboration take — exactly how our @kimi summon works best.",
            },
          },
          {
            kind: "note",
            code: "NOTE",
            title: { zh: "迭代实录：同一需求，五轮对话的完整演进", en: "Iteration log: one requirement, five rounds, unabridged" },
            author: { zh: "社区 · @echo_five", en: "community · @echo_five" },
            ref: { kind: "post", id: 0 }, // 占位 id,运营替换为真实社区帖
            external: false,
            duration: { zh: "长文 · 14 分钟", en: "long read · 14 min" },
            why: {
              zh: "公布完整对话与用量（已验证）：「工作流记录」这类内容的样板。",
              en: "Full dialogue plus verified usage — the template for our workflow-record type.",
            },
          },
        ],
        branches: [],
      },
      {
        name: { zh: "产物证据", en: "Artifact Evidence" },
        desc: {
          zh: "方法的价值看产物。这几件作品的构建过程用量都经过验证。",
          en: "Methods are judged by artifacts. These builds carry verified usage.",
        },
        learn: [{ zh: "用产物校准方法", en: "Calibrate methods by artifacts" }],
        hours: 1,
        resources: [
          {
            kind: "evidence",
            code: "EV",
            title: { zh: "终点：用这套方法做出来的作品", en: "Endpoint: works built with this method" },
            author: { zh: "作品墙", en: "works wall" },
            ref: { kind: "work", id: 0 }, // 占位 id,运营替换为真实作品
            external: false,
            duration: { zh: "浏览", en: "browse" },
            why: {
              zh: "证据收口：方法争论的终点是产物，不是观点。",
              en: "Evidence close-out: method debates end at artifacts, not opinions.",
            },
          },
        ],
        branches: [],
      },
    ],
    achievement: {
      title: { zh: "「协作设计师」", en: "“Collaboration Designer”" },
      note: {
        zh: "完成本路径即解锁徽章：你的迭代实录被收录时，成为路径的一部分。",
        en: "Complete this path to unlock the badge: your iteration log becomes part of the path when curated.",
      },
    },
  },
  {
    slug: "api-and-usage",
    code: "PATH-04",
    tier: "builder",
    variant: "editorial",
    title: { zh: "API 与用量：把 Kimi 接进自己的产品", en: "API & usage: wire Kimi into your product" },
    tagline: {
      zh: "把「要花多少钱」从猜测变成可查。",
      en: "Turn “what does it cost?” from guesswork into lookup.",
    },
    summary: {
      zh: "从调用 API 到看懂账单：计价地基、接线实操、账本核对三节。⚠️ 待重验：上月模型计价档位更新，编辑尚未重走全程。",
      en: "From API calls to reading the bill: pricing foundations, wiring practice, ledger reconciliation. ⚠️ Re-verification pending after last month's pricing-tier change.",
    },
    editorHandle: "pipe_dreamer",
    verifiedModel: "kimi-latest",
    /* 验证戳 2026-06 已超 45 天保质期 → isPathStale 自然算出「待重验」(不再手填 stale) */
    verifiedAt: "2026-06",
    reverifyLog: [
      {
        at: "2026-05",
        model: "kimi-latest",
        note: {
          zh: "计价档位说明更新后重验「计价地基」层。",
          en: "Re-verified Pricing Foundations after the pricing-tier notes changed.",
        },
      },
    ],
    hours: 8,
    levels: [
      {
        name: { zh: "计价地基", en: "Pricing Foundations" },
        desc: {
          zh: "计价口径只认官方页；社区的价格快照仅做交叉参考。",
          en: "Pricing truth lives only on the official page; community snapshots are cross-checks.",
        },
        learn: [
          { zh: "模型与计价档位", en: "Models & pricing tiers" },
          { zh: "限流与配额", en: "Rate limits & quotas" },
        ],
        hours: 3,
        resources: [
          {
            kind: "official",
            code: "DOC",
            title: { zh: "官方 API 参考：模型、计价与限流", en: "Official API reference: models, pricing, rate limits" },
            author: { zh: "Kimi 官方文档", en: "Kimi official docs" },
            href: "https://platform.moonshot.ai/docs/api",
            external: true,
            duration: { zh: "约 40 分钟", en: "~40 min read" },
            why: {
              zh: "口径唯一来源；本页一动，本路径立即进入待重验。",
              en: "The single source of truth; when this page moves, this path goes straight to re-verification.",
            },
          },
        ],
        branches: [
          {
            title: { zh: "缓存与上下文档位说明", en: "Cache & context-tier notes" },
            meta: { zh: "文档 · 官方", en: "Doc · Official" },
            href: "https://platform.moonshot.ai/docs/pricing-tiers",
            external: true,
          },
        ],
      },
      {
        name: { zh: "接线实操", en: "Wiring Practice" },
        desc: {
          zh: "从零接线到一个能跑的生产调用：错误处理与重试才是接线课的正课。",
          en: "From zero to a production-ready call: retries and error handling are the real curriculum.",
        },
        learn: [
          { zh: "生产级错误处理", en: "Production error handling" },
          { zh: "重试与退避", en: "Retries & backoff" },
        ],
        hours: 3,
        resources: [
          {
            kind: "video-youtube",
            code: "YT",
            title: { zh: "实操：从零接线到一个能跑的生产调用", en: "Hands-on: from zero to a production-ready call" },
            author: { zh: "YouTube · @wiring_lab", en: "YouTube · @wiring_lab" },
            href: "https://www.youtube.com/watch?v=kimi-api-01",
            external: true,
            duration: { zh: "36 分钟", en: "36 min" },
            why: {
              zh: "把错误处理讲得最认真的一门：接线课最容易省略的正是这些。",
              en: "The only course that takes retries seriously — exactly what wiring tutorials skip.",
            },
          },
        ],
        branches: [],
      },
      {
        name: { zh: "账本核对", en: "Ledger Reconciliation" },
        desc: {
          zh: "用真实账本校准预期：成本曲线、缓存命中率，数据可复算。",
          en: "Calibrate expectations with real ledgers: cost curves and cache hit rates, reproducible.",
        },
        learn: [
          { zh: "成本曲线怎么读", en: "Reading cost curves" },
          { zh: "缓存命中率与费用", en: "Hit rate & spend" },
        ],
        hours: 2,
        resources: [
          {
            kind: "note",
            code: "NOTE",
            title: { zh: "账本实录：一个 Side Project 的真实 API 成本曲线", en: "Ledger log: the real API cost curve of a side project" },
            author: { zh: "社区 · @cost_watcher", en: "community · @cost_watcher" },
            ref: { kind: "post", id: 0 }, // 占位 id,运营替换为真实社区帖
            external: false,
            duration: { zh: "长文 · 12 分钟", en: "long read · 12 min" },
            why: {
              zh: "十二周逐周成本曲线配缓存命中率，usage CLI 开源可复算。",
              en: "A 12-week cost curve with cache hit rates, reproducible via the open-source usage CLI.",
            },
          },
          {
            kind: "evidence",
            code: "EV",
            title: { zh: "终点：用量榜上别人的真实账本", en: "Endpoint: real ledgers on the usage leaderboard" },
            author: { zh: "用量中心 · 公开榜", en: "usage center · public leaderboard" },
            ref: { kind: "work", id: 0 }, // 占位 id,运营替换为公开账本的真实作品
            external: false,
            duration: { zh: "浏览", en: "browse" },
            why: {
              zh: "把成本从猜测变成可查：榜上是自愿公开的真实用量。",
              en: "Cost as lookup, not guesswork: voluntary, verified, public.",
            },
          },
        ],
        branches: [],
      },
    ],
    achievement: {
      title: { zh: "「账房先生」", en: "“The Ledger Keeper”" },
      note: {
        zh: "完成本路径即解锁徽章：你的账本实录被收录时，数据必须可复算。",
        en: "Complete this path to unlock the badge: curated ledger logs must be reproducible.",
      },
    },
  },
];

export function findLearnPath(slug: string): LearnPath | undefined {
  return LEARN_PATHS.find((p) => p.slug === slug);
}

/* 毕业归因来源校验(/works/new?path=slug,plan §二.5):只接受在册路径 slug;
   空白/超长/不在册 → null(非法来源静默置空,不写脏数据)。 */
export function normalizePathSlug(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > 64) return null;
  return findLearnPath(s) ? s : null;
}

/* 资源类型 → 展示元数据(封面角标配色 + 行式 eyebrow 前缀) */
export function resourceKindMeta(kind: ResourceKind, zh: boolean): { label: string; chip: string } {
  const map: Record<ResourceKind, { zh: string; en: string; chip: string }> = {
    official: { zh: "官方", en: "OFFICIAL", chip: "border-blue/60 text-blue" },
    "video-youtube": { zh: "YOUTUBE", en: "YOUTUBE", chip: "border-line text-grey" },
    "video-bilibili": { zh: "BILIBILI", en: "BILIBILI", chip: "border-line text-grey" },
    "post-x": { zh: "X · THREAD", en: "X · THREAD", chip: "border-line text-grey" },
    note: { zh: "社区笔记", en: "COMMUNITY NOTE", chip: "border-line text-paper" },
    evidence: { zh: "证据终点", en: "EVIDENCE", chip: "border-status-ok/40 text-status-ok-fg" },
  };
  const m = map[kind];
  return { label: zh ? m.zh : m.en, chip: m.chip };
}
