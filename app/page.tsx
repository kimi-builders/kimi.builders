/* 首页完整版(P0-1):海报(hero + 主 CTA)→ 数据条 → 本周精选(无精选回落
   7 日热门,两者皆空则不渲染)→ 入群/订阅 → 免责声明。
   保持 data-theme-scope="dark" 海报皮肤(硬边细线、蓝强调、mono 大字距),
   新区块全部走令牌,不硬编码色值;新文案全部双语(i18n.ts)。
   hero 用 SMIL 动画版 Logo(双星 8s 绕轨,<img> 内 SMIL 现代浏览器可播),
   alt 随 UI 语言本地化(P2-9);右上角登录态由 AuthChip 渲染。
   渲染策略:AuthChip 读 cookies + searchParams,路由级 ISR 不成立,所以
   DB 查询走数据层 ISR —— getHomeData 是 unstable_cache(revalidate 300),
   精选/取消精选的 action 里 updateTag("home") 即时作废(见 src/lib/home.ts);
   海报主体仍是静态标记。 */
import Link from "next/link";
import { headers } from "next/headers";
import AuthChip from "@/components/AuthChip";
import { TrackClick } from "@/app/(app)/_components/track";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber } from "@/src/lib/format";
import { getHomeData, type HomeFeaturedItem } from "@/src/lib/home";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { LocaleToggle } from "./(app)/_components/pref-controls";

const AUTH_ERRORS: Record<string, I18nKey> = {
  state_mismatch: "home.errState",
  oauth_failed: "home.errOauth",
};

/* 精选卡片:帖子链站内详情,作品直达外链(无链接回落 /works)。 */
function FeaturedCard({
  item: f,
  locale,
}: {
  item: HomeFeaturedItem;
  locale: Locale;
}) {
  const titleCls =
    "mt-3 block font-medium leading-snug text-paper transition-colors hover:text-blue";
  const title = f.external ? (
    <a href={f.href} target="_blank" rel="noopener noreferrer" className={titleCls}>
      {f.title}
    </a>
  ) : (
    <Link href={f.href} className={titleCls}>
      {f.title}
    </Link>
  );
  return (
    <article className="border border-line bg-card p-5 text-left">
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className="border border-line px-1.5 py-px text-grey">
          {t(locale, f.kind === "post" ? "featured.kindPost" : "featured.kindWork")}
        </span>
        <span className="border border-blue/60 px-1.5 py-px text-blue">
          {t(locale, "featured.badge")}
        </span>
      </div>
      <TrackClick
        payload={{
          event: "featured_click",
          target_kind: f.kind,
          target_id: String(f.id),
          meta: { position: "home" },
        }}
      >
        {title}
      </TrackClick>
      {f.excerpt && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-grey">
          {f.excerpt}
        </p>
      )}
      {f.reason && (
        <p className="mt-3 border-l-2 border-blue pl-3 text-sm leading-relaxed text-grey">
          {f.reason}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[10px] text-grey">
        {f.authorHref ? (
          <Link href={f.authorHref} className="truncate transition-colors hover:text-blue">
            {f.author}
          </Link>
        ) : (
          <span className="truncate">{f.author}</span>
        )}
        {f.editorHandle && (
          <span className="shrink-0">
            {t(locale, "featured.by", { handle: f.editorHandle })}
          </span>
        )}
      </div>
    </article>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth_error: authError } = await searchParams;
  const requestHeaders = await headers();
  trackEvent("home_view", { kind: "page", id: "home" }, { headers: requestHeaders });
  const user = await getSessionUser();
  const [locale, home] = await Promise.all([
    getLocale(user),
    /* DB 不可用时海报照常落地:数据条/精选位整体不渲染,不拖垮首页门面 */
    getHomeData().catch(() => null),
  ]);

  const stats = home
    ? [
        { n: home.stats.members, l: t(locale, "side.members") },
        { n: home.stats.posts, l: t(locale, "side.posts") },
        { n: home.stats.comments, l: t(locale, "side.comments") },
        { n: home.stats.tokens, l: t(locale, "home.tokens") },
      ]
    : null;

  return (
    <main data-theme-scope="dark" className="bg-bg">
      {/* ---- 海报区:hero + 主 CTA(全页视觉焦点)---- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="absolute right-5 top-5 flex items-center gap-4 font-mono text-xs">
          {/* 首页也要语言切换:复用壳内同一控件(cookie + html.lang + refresh) */}
          <LocaleToggle
            withLabel
            className="flex items-center gap-1.5 text-grey transition-colors hover:text-paper"
          />
          <AuthChip />
        </div>
        {typeof authError === "string" && (
          <p className="absolute top-16 font-mono text-xs text-blue">
            {t(locale, AUTH_ERRORS[authError] ?? "home.errGeneric")}
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-animated.svg"
          alt={t(locale, "home.logoAlt")}
          className="h-44 w-44"
        />
        <h1 className="mt-10 font-mono text-4xl font-semibold tracking-wide">
          kimi<span className="text-blue">.</span>builders
        </h1>
        <p className="mt-5 font-mono text-sm tracking-[0.24em] text-paper">
          BUILD GOOD THINGS WITH KIMI<span className="text-blue">.</span>
        </p>
        <p className="mt-3 text-lg font-medium">{t(locale, "home.tagline")}</p>
        <p className="mt-8 font-mono text-xs tracking-[0.3em] text-grey">
          EXPLORE TOGETHER. BUILD TOGETHER.
        </p>
        <p className="mt-2 text-sm text-grey">{t(locale, "home.heroSub")}</p>
        <Link
          href="/community"
          className="mt-12 inline-flex w-72 items-center justify-center bg-blue py-3.5 font-mono text-sm font-semibold tracking-widest text-bg transition-opacity hover:opacity-85"
        >
          {t(locale, "home.cta")} →
        </Link>
        {/* 站点入口:主 CTA 下的边框按钮排,固定宽度(中英同宽,一眼可点) */}
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-2.5 font-mono text-[11px] tracking-wider">
          {(
            [
              ["/community", "nav.community"],
              ["/works", "nav.works"],
              ["/awesome", "nav.awesome"],
              ["/usage/leaderboard", "home.entryLeaderboard"],
            ] as const
          ).map(([href, key]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex w-32 items-center justify-center border border-line py-2 text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, key)}
            </Link>
          ))}
        </nav>
      </section>

      {/* ---- 数据条:成员 / 帖子 / 评论 / 全站 token 累计(真实数据)---- */}
      {stats && (
        <section className="border-y border-line">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 px-6 py-12 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.l} className="text-center">
                <div className="font-mono text-3xl font-semibold tracking-wide">
                  {compactNumber(s.n, locale)}
                </div>
                <div className="mt-2 font-mono text-[11px] tracking-[0.2em] text-grey">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- 本周精选:编辑署名定夺;无精选回落 7 日热门;皆空不渲染 ---- */}
      {home?.featured.length ? (
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center font-mono text-xs tracking-[0.3em] text-grey">
            {t(locale, "home.featured")}
          </h2>
          <p className="mt-3 text-center text-xs text-grey">
            {t(locale, "home.featuredSub")}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {home.featured.map((f) => (
              <FeaturedCard key={`${f.kind}-${f.id}`} item={f} locale={locale} />
            ))}
          </div>
        </section>
      ) : home?.hot.length ? (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center font-mono text-xs tracking-[0.3em] text-grey">
            {t(locale, "side.hot")}
          </h2>
          <ul className="mt-8 border-y border-line">
            {home.hot.map((h, i) => (
              <li key={h.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/community/${h.id}`}
                  className="flex items-baseline gap-4 py-3 transition-colors hover:text-blue"
                >
                  <span className="shrink-0 font-mono text-[11px] text-grey">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-paper">
                    {h.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-grey">
                    {t(locale, "post.comments", { n: h.commentCount })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- 入群 / 订阅 ---- */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-center font-mono text-xs tracking-[0.3em] text-grey">
          {t(locale, "home.join")}
        </h2>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "org",
              meta: { slot: "org" },
            }}
          >
            <a
              href="https://github.com/kimi-builders"
              target="_blank"
              rel="noopener noreferrer"
              className="group border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-blue">
                GitHub
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinDisc")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] text-blue">
                {t(locale, "home.joinDiscCta")} →
              </span>
            </a>
          </TrackClick>
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "awesome",
              meta: { slot: "awesome" },
            }}
          >
            <a
              href="https://github.com/kimi-builders/awesome-kimi-builders"
              target="_blank"
              rel="noopener noreferrer"
              className="group border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-blue">
                Awesome Kimi Builders
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinAwesome")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] text-blue">
                {t(locale, "home.joinAwesomeCta")} →
              </span>
            </a>
          </TrackClick>
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "mail",
              meta: { slot: "mail" },
            }}
          >
            <a
              href="mailto:hi@kimi.builders"
              className="group border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-blue">
                hi@kimi.builders
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinMail")}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] text-blue">
                hi@kimi.builders →
              </span>
            </a>
          </TrackClick>
        </div>
      </section>

      {/* ---- 免责声明:两行,随 UI 语言切换 ---- */}
      <footer className="mx-auto max-w-xl px-6 pb-10 pt-4 text-center text-xs leading-relaxed text-grey">
        <p>{t(locale, "home.footerLine1")}</p>
        <p className="mt-1">{t(locale, "home.footerLine2")}</p>
      </footer>
    </main>
  );
}
