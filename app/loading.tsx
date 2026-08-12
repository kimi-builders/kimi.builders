export default function Loading() {
  return (
    <main
      className="flex min-h-[70vh] w-full flex-col items-center justify-center px-6"
      aria-label="页面加载中 / Loading page"
    >
      {/* 品牌加载态:首页同款双星绕月(SMIL 动画,浏览器原生播放) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-animated.svg"
        alt="kimi.builders"
        className="h-36 w-36 rounded-3xl border border-line"
      />
      <p className="mt-6 font-mono text-[11px] tracking-[0.3em] text-grey">
        LOADING<span className="text-blue">.</span>
      </p>
    </main>
  );
}
