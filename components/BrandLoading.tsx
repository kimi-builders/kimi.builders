/* Brand loading state for the root loading boundary: the home page's
   twin stars orbiting the moon. This remains the one reduced-motion
   exception: the endless shared orbit is the brand meaning, not
   decorative transition. In-shell routes use RouteLoading instead. */
import { t, type Locale } from "@/src/lib/i18n";

export default function BrandLoading({ locale }: { locale: Locale }) {
  return (
    <main
      className="flex min-h-[70vh] w-full flex-col items-center justify-center px-6"
      aria-label={t(locale, "load.aria")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-animated.svg"
        alt="kimi.builders"
        className="h-36 w-36 rounded-3xl border border-line"
      />
      <p className="mt-6 font-mono text-xs tracking-[0.08em] text-grey">
        LOADING<span className="text-ui-blue">.</span>
      </p>
    </main>
  );
}
