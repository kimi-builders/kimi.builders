/* 提交作品主体:完整页(/works/new)与弹窗(@modal/(.)works/new)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。
   声明制(20260822_work_claims):声明字段上下文 = 作者可验证总量 − 已声明合计;
   新作品尚无名字可匹配,建议预填值留空(编辑页按作品名匹配项目分布)。
   毕业归因(20260920):?path=<slug> 带入来源路径上下文(横幅 + 隐藏字段),
   非法 slug 与不带来源相同;登录引导的回跳地址保留 path 参数。 */
import { SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getWorksSource } from "@/src/lib/works-view-server";
import { getClaimAllowance } from "@/src/lib/works";
import { findLearnPath, normalizePathSlug } from "@/app/(app)/learn/_data";
import { createWorkAction } from "../../actions";
import WorkForm from "../../_components/WorkForm";

export default async function NewWorkContent({
  showTitle = true,
  searchParams,
}: {
  showTitle?: boolean;
  /* 毕业归因(20260920,plan §二.5):?path=<slug> 带入来源路径上下文;
     非法 slug 静默丢弃(与不带来源相同) */
  searchParams?: Promise<{ path?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";

  const sp = searchParams ? await searchParams : {};
  const sourceSlug = normalizePathSlug(
    typeof sp.path === "string" ? sp.path : "",
  );
  const sourcePath = sourceSlug ? findLearnPath(sourceSlug) : undefined;
  /* 登录后回来仍带来源上下文 */
  const newHref = sourceSlug
    ? `/works/new?path=${encodeURIComponent(sourceSlug)}`
    : "/works/new";

  if (!user) {
    return (
      <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
        {showTitle && (
          <h1 className="font-mono text-lg font-semibold">
            {t(locale, "works.newTitle")}
          </h1>
        )}
        {/* 未登录:统一登录引导卡(20260919) */}
        <div className={showTitle ? "mt-6" : ""}>
          <LoginGate
            locale={locale}
            title={t(locale, "gate.work")}
            next={newHref}
          />
        </div>
      </div>
    );
  }

  const [allowance, src] = await Promise.all([
    getClaimAllowance(user.id),
    /* 新建意图默认跟来源列表(20260815):从 Awesome 的提交入口进来,
       表单直接落在「推荐站外项目」档——服务端读 kb-works-src(proxy 在
       列表页写入)直出,无水合跳变;与左栏高亮/详情页「返回」同一事实源 */
    getWorksSource(),
  ]);

  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <SquarePen size={17} />
          {t(locale, "works.newTitle")}
        </h1>
      )}
      <WorkForm
        action={createWorkAction}
        locale={locale}
        modal={!showTitle}
        defaultKind={src === "awesome" ? "awesome" : "site"}
        sourcePath={
          sourcePath && sourceSlug
            ? {
                slug: sourceSlug,
                /* 服务端本地化(避免客户端表单引用整份路径 mock 数据) */
                text: zh
                  ? `来自路径 ${sourcePath.code} · ${sourcePath.title.zh} — 发布后计入这条路径的毕业作品`
                  : `From path ${sourcePath.code} · ${sourcePath.title.en} — your work will count as a graduate of this path`,
              }
            : null
        }
        claim={{
          initial: null,
          hasUsage: allowance.total > 0,
          remaining: allowance.remaining,
          suggested: null,
        }}
      />
    </div>
  );
}
