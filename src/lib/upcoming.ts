/* 未就绪板块开关:月刊 / 知识库 / Demo Night 的内容资源还没准备好,
   空白功能不上线——导航保留入口但标 SOON,页面整体换成「正在路上」
   占位(SoonPanel),右栏回落 community rail。
   某个板块就绪后:把它改为 false,并删掉对应页面里的 UPCOMING 分支。 */
export const UPCOMING = {
  /* blog 20260920 开闸:月刊已切真实组装(src/lib/monthly.ts),零期次有诚实空态。
     learn 20260921 重新关闸:机制(毕业归因/讨论闭环/ref 解析)已齐,但 _data.ts
     的策展内容仍是占位(假外链 + 占位 ref id=0)——开闸标准:外链逐条真实 +
     ref 配真实对象 + 计数与渲染同口径(已就绪)。 */
  blog: true,
  learn: true,
  demoNight: true,
} as const;

/* 近期不打算上线的板块:导航/搜索入口直接屏蔽(挂 SOON 也是持续曝光),
   URL 仍走上面的 UPCOMING 占位。恢复上线时把对应项改 false 并加回入口。 */
export const NAV_HIDDEN = {
  demoNight: true,
} as const;
