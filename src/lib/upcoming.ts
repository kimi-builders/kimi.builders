/* 未就绪板块开关:Demo Night 的内容资源还没准备好,
   空白功能不上线——导航保留入口但标 SOON,页面整体换成「正在路上」
   占位(SoonPanel),右栏回落 community rail。
   某个板块就绪后:把它改为 false,并删掉对应页面里的 UPCOMING 分支。
   20260821:blog/learn 合并为 explore(月刊 × 教程同一文章架)。 */
export const UPCOMING = {
  /* explore 20260821 开闸:四维内容架(分类/系列/标签/归档),
     空内容是诚实空态。 */
  explore: false,
  demoNight: true,
} as const;

/* 近期不打算上线的板块:导航/搜索入口直接屏蔽(挂 SOON 也是持续曝光),
   URL 仍走上面的 UPCOMING 占位。恢复上线时把对应项改 false 并加回入口。 */
export const NAV_HIDDEN = {
  demoNight: true,
} as const;
