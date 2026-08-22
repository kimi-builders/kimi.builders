/* Brand loading state: the home page's twin stars orbiting the moon
   (SMIL animation, played natively by the browser). Every route's
   loading.tsx references this — no ad-hoc skeleton cards. */
export default function BrandLoading() {
  return (
    <main
      className="flex min-h-[70vh] w-full flex-col items-center justify-center px-6"
      aria-label="页面加载中 / Loading page"
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
