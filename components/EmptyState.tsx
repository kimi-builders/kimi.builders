/* 统一空态基元(20260821 评审):月牙 + 双星的品牌空态插画(icon.svg 的
   小尺寸几何,颜色走令牌随主题),替代各页零散的 SearchX/Star 行内块。
   variant="card" 独立卡(列表主空态,规格对齐 SoonPanel);
   variant="inline" 无卡壳(嵌在右栏 Widget / 面板内,不套卡中卡)。
   actions 插槽给行动引导——空社区的最优解是 CTA,不是只有一句鼓励。 */
import type { ReactNode } from "react";

/* 月牙双星:与 app/icon.svg 同稿的几何;fill 走 CSS 令牌,双主题安全。
   mask id 全站同值(内容恒等,同页多实例碰撞无副作用)。 */
function CrescentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <defs>
        <mask id="kb-empty-crescent">
          <circle cx="460" cy="545" r="355" fill="#fff" />
          <circle cx="396" cy="518" r="336.6" fill="#000" />
        </mask>
      </defs>
      <circle
        cx="460"
        cy="545"
        r="355"
        fill="currentColor"
        opacity="0.85"
        mask="url(#kb-empty-crescent)"
      />
      <circle cx="845" cy="310" r="46" fill="var(--color-ui-blue)" opacity="0.8" />
      <circle cx="725" cy="205" r="26" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export default function EmptyState({
  message,
  hint,
  actions,
  variant = "card",
  className,
}: {
  /* 主体文案(空态说明) */
  message: ReactNode;
  /* 次行指引(内容引导/操作提示) */
  hint?: ReactNode;
  /* 行动引导(CTA 行,居中排布) */
  actions?: ReactNode;
  variant?: "card" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div className={`text-center ${className ?? ""}`}>
        <CrescentMark className="mx-auto size-7 text-grey/70" />
        <p className="mt-2 text-xs leading-relaxed text-grey">{message}</p>
        {actions}
      </div>
    );
  }
  return (
    <div
      className={`rounded-2xl border border-line bg-card px-6 py-14 text-center sm:py-16 ${
        className ?? ""
      }`}
    >
      <CrescentMark className="mx-auto size-11 text-grey/60" />
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-grey">
        {message}
      </p>
      {hint && (
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-grey/70">
          {hint}
        </p>
      )}
      {actions && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
