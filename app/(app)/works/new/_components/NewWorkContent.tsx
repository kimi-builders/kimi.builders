/* 提交作品主体:完整页(/works/new)与弹窗(@modal/(.)works/new)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。
   声明制(20260822_work_claims):声明字段上下文 = 作者可验证总量 − 已声明合计;
   新作品尚无名字可匹配,建议预填值留空(编辑页按作品名匹配项目分布)。 */
import { SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getClaimAllowance } from "@/src/lib/works";
import { createWorkAction } from "../../actions";
import WorkForm from "../../_components/WorkForm";

export default async function NewWorkContent({
  showTitle = true,
}: {
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);

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
            next="/works/new"
          />
        </div>
      </div>
    );
  }

  const allowance = await getClaimAllowance(user.id);

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
