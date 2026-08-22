"use client";

/* Name-brick tone palette: without an uploaded cover, the list cover is
   the name brick in the chosen tone. Self-contained state + hidden
   field (coverTone); shared by WorkMediaFields (the cover tab) and
   WorkForm (awesome recommendation info). Structurally identical to
   the "upload a cover" option — a same-size swatch preview on the left
   (h-24 w-40, stable height across tab switches) + color buttons on
   the right; the theme option means the same in both paths (follow the
   theme; per-kind coloring is retired). inactive: permanently mounted —
   UI hidden, hidden field unsubmitted, but the component state (chosen
   tone) survives, so switching intent back needs no re-pick; only one
   of the two paths is active at a time, so no duplicate coverTone
   submission. */
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
  /* Awesome entries: the field title uses recommendation-context copy
     (the option's meaning matches the works path). */
  forAwesome?: boolean;
  inactive?: boolean;
  /* Hide this field's title when the outer tab provides the label
     (preview and buttons stay). */
  hideLabel?: boolean;
  /* Selection changes are reported up for the form's live preview;
     internal state remains the single source of truth. */
  onToneChange?: (tone: string) => void;
}) {
  const [tone, setTone] = useState(initialTone);
  const pick = (id: string) => {
    setTone(id);
    onToneChange?.(id);
  };
  /* Re-report on activation: both CoverToneFields stay mounted with
     their own states — after an intent switch, the newly active one
     must sync its real value back to the form preview, or the preview
     stays on the other field's last selection and disagrees with both
     the palette and the submission. */
  useEffect(() => {
    if (!inactive) onToneChange?.(tone);
  }, [inactive, tone, onToneChange]);
  /* The swatch preview shares the name brick's source: work-tone-* and
     work-cover-tile shift with the theme — WYSIWYG. */
  const previewCls = coverToneClass(tone) ?? "work-cover-tile";
  return (
    <div className={inactive ? "hidden" : undefined}>
      {!inactive && <input type="hidden" name="coverTone" value={tone} readOnly />}
      {!hideLabel && (
        <span className="mb-1.5 block text-xs text-grey">
          {t(locale, forAwesome ? "works.coverToneAwesome" : "works.coverTone")}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {/* 色块预览:与上传档的图片占位同尺寸(h-24 w-40),tab 切换不跳动 */}
        <span
          aria-hidden="true"
          className={`flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-line ${previewCls}`}
        >
          <span className="font-mono text-xs tracking-wider opacity-60">
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
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
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
      <span className="mt-1 block text-xs leading-relaxed text-grey/80">
        {t(locale, forAwesome ? "works.coverToneAwesomeHint" : "works.coverToneHint")}
      </span>
    </div>
  );
}
