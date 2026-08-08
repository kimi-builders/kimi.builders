/* 提交作品(需登录):表单字段与校验见 _components/WorkForm 与 actions。 */
import type { Metadata } from "next";
import { SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { createWorkAction } from "../actions";
import WorkForm from "../_components/WorkForm";

export const metadata: Metadata = { title: "提交作品 — kimi.builders" };

export default async function NewWorkPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (!user) {
    return (
      <div>
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "works.newTitle")}
        </h1>
        <p className="mt-8 text-sm text-grey">
          {t(locale, "works.loginRequired")}
          <a
            href="/api/auth/github"
            className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            GitHub
          </a>
          <a
            href="/api/auth/google"
            className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
          >
            Google
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
        <SquarePen size={17} />
        {t(locale, "works.newTitle")}
      </h1>
      <WorkForm action={createWorkAction} locale={locale} />
    </div>
  );
}
