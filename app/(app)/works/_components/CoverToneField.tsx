"use client";

/* 名称砖色板(20260908 引入,20260914 拆分为独立字段):无上传封面时,
   列表封面用所选色调的名称砖。自含状态与隐藏字段(coverTone),
   WorkMediaFields(作品封面 tab)与 WorkForm(awesome 推荐信息)共用。
   20260815:与「上传封面图」档同构——左侧同尺寸色块预览区(h-24 w-40,
   tab 切换高度一致不跳动) + 右侧颜色按钮;theme 档两条路径同义
   (跟随主题,按类型定色已下线)。
   inactive(20260919):常驻挂载方案——隐藏 UI、不提交隐藏字段,但组件状态
   (已选色调)保留,切换意图回来不用重选;两条路径同一时刻只有一条激活,
   不会出现重复的 coverTone 提交。 */
import { useEffect, useState } from "react";
import { COVER_TONES, coverToneClass, coverToneName } from "@/src/lib/cover-tones";
import { t, type Locale } from "@/src/lib/i18n";

export default function CoverToneField({
  locale,
  initialTone = "theme",
  forAwesome = false,
  inactive = false,
  hideLabel = false,
  onToneChange,
}: {
  locale: Locale;
  initialTone?: string;
  /* awesome 推荐条目:字段标题用推荐语境文案(档位语义与作品路径一致) */
  forAwesome?: boolean;
  inactive?: boolean;
  /* 标签由外部 tab 承担时隐藏本字段标题(预览与按钮保留) */
  hideLabel?: boolean;
  /* 选择变化上报(20260919):表单层实时预览用;内部状态仍是唯一事实源 */
  onToneChange?: (tone: string) => void;
}) {
  const [tone, setTone] = useState(initialTone);
  const pick = (id: string) => {
    setTone(id);
    onToneChange?.(id);
  };
  /* 激活时重新上报(20260919 验收补):作品/awesome 两条 CoverToneField 常驻挂载、
     各自持状态——切换意图后新激活那条要把自己的真实值同步回表单层预览,
     否则预览停留在另一条字段上次的选择,与色板/实际提交都不一致 */
  useEffect(() => {
    if (!inactive) onToneChange?.(tone);
  }, [inactive, tone, onToneChange]);
  /* 色块预览与名称砖同源:work-tone 系列与 work-cover-tile 随主题换色,所见即所得 */
  const previewCls = coverToneClass(tone) ?? "work-cover-tile";
  return (
    <div className={inactive ? "hidden" : undefined}>
      {!inactive && <input type="hidden" name="coverTone" value={tone} readOnly />}
      {!hideLabel && (
        <span className="mb-1.5 block text-[11.5px] text-grey">
          {t(locale, forAwesome ? "works.coverToneAwesome" : "works.coverTone")}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {/* 色块预览:与上传档的图片占位同尺寸(h-24 w-40),tab 切换不跳动 */}
        <span
          aria-hidden="true"
          className={`flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-line ${previewCls}`}
        >
          <span className="font-mono text-[10.5px] tracking-wider opacity-60">
            {t(locale, "works.tilePreview")}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {COVER_TONES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tone === item.id}
              onClick={() => pick(item.id)}
              title={coverToneName(item.id, locale === "zh")}
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
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
      </div>
      <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
        {t(locale, forAwesome ? "works.coverToneAwesomeHint" : "works.coverToneHint")}
      </span>
    </div>
  );
}
