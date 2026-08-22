/* Unified empty-state primitive: the crescent + twin-star brand
   illustration (icon.svg's geometry at small size, token colors
   following the theme), replacing scattered SearchX/Star inline
   blocks. variant="card" is a standalone card (a list's main empty
   state, sized like SoonPanel); variant="inline" has no card shell
   (nested inside a rail Widget / panel — no card-in-card). The actions
   slot carries the call to action — an empty community's best answer
   is a CTA, not encouragement alone. */
import type { ReactNode } from "react";

/* Crescent + twin stars: the same geometry as app/icon.svg; fills
   ride CSS tokens, safe across themes. The mask id is one constant
   site-wide (identical content — same-page collisions are harmless). */
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
  /* Main copy (the empty-state description). */
  message: ReactNode;
  /* Secondary guidance (content direction / action hint). */
  hint?: ReactNode;
  /* Call to action (CTA row, centered). */
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
