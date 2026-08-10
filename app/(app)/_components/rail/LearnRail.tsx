/* /learn 右栏:学习路径说明卡(简短)。文章详情页同 rail(right-rail.ts)。 */
import { t, type Locale } from "@/src/lib/i18n";
import Widget from "./Widget";

export default function LearnRail({ locale }: { locale: Locale }) {
  return (
    <Widget title={t(locale, "rail.learnPath")}>
      <p className="text-xs leading-relaxed text-grey">
        {t(locale, "rail.learnBody")}
      </p>
    </Widget>
  );
}
