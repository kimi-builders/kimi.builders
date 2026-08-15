"use client";

/* 名称砖色板(20260908 引入,20260914 拆分为独立字段):
   「我的作品」无配图时生效;Awesome 推荐条目未选则按类型族定色(awesomeToneFor)。
   自含状态与隐藏字段(coverTone),WorkMediaFields(作品)与 WorkForm(awesome)共用。
   inactive(20260919):常驻挂载方案——隐藏 UI、不提交隐藏字段,但组件状态
   (已选色调)保留,切换意图回来不用重选;两条路径同一时刻只有一条激活,
   不会出现重复的 coverTone 提交。 */
import { useState } from "react";
import { COVER_TONES, coverToneName } from "@/src/lib/cover-tones";
import { t, type Locale } from "@/src/lib/i18n";

export default function CoverToneField({
  locale,
  initialTone = "theme",
  forAwesome = false,
  inactive = false,
}: {
  locale: Locale;
  initialTone?: string;
  /* awesome 推荐条目:默认档的语义是「按类型定色」而不是跟随主题 */
  forAwesome?: boolean;
  inactive?: boolean;
}) {
  const [tone, setTone] = useState(initialTone);
  return (
    <div className={inactive ? "hidden" : undefined}>
      {!inactive && <input type="hidden" name="coverTone" value={tone} readOnly />}
      <span className="mb-1.5 block text-[11.5px] text-grey">
        {t(locale, forAwesome ? "works.coverToneAwesome" : "works.coverTone")}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {COVER_TONES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tone === item.id}
            onClick={() => setTone(item.id)}
            title={coverToneName(item.id, locale === "zh")}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              tone === item.id
                ? "border-blue bg-blue/10 text-blue"
                : "border-line text-grey hover:border-paper/30 hover:text-paper"
            }`}
          >
            {/* swatch 与名称砖同源:.work-tone-* 随主题换色,所见即所得 */}
            <span
              aria-hidden="true"
              className={
                item.dark
                  ? `work-tone work-tone-${item.id} size-3.5 rounded-[4px] border border-line`
                  : "size-3.5 rounded-[4px] border border-line"
              }
              style={
                item.dark
                  ? undefined
                  : { background: "linear-gradient(135deg, #0e0e13 50%, #f4eee4 50%)" }
              }
            />
            {coverToneName(item.id, locale === "zh")}
          </button>
        ))}
      </div>
      <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
        {t(locale, forAwesome ? "works.coverToneAwesomeHint" : "works.coverToneHint")}
      </span>
    </div>
  );
}
