/* 未就绪板块开关:月刊 / 知识库 / Demo Night 的内容资源还没准备好,
   空白功能不上线——导航保留入口但标 SOON,页面整体换成「正在路上」
   占位(SoonPanel),右栏回落 community rail。
   某个板块就绪后:把它改为 false,并删掉对应页面里的 UPCOMING 分支。 */
export const UPCOMING = {
  blog: true,
  learn: true,
  demoNight: true,
} as const;
