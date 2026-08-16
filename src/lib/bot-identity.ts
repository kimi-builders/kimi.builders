/* Bot 身份常量(20260816 抽出):客户端组件(召唤等待占位行)也要用,
   从 ai-reply.ts 抽到无服务端依赖的中立模块,避免客户端打包 mysql 池。
   ai-reply.ts 继续 re-export,既有引用不受影响。 */
export const BOT_NAME = "Kimi 小筑";
/* 小尺寸瓷砖标(月牙+双星放大,暗底):评论里 20px 也可辨,双主题稳定。 */
export const BOT_AVATAR = "/brand/logo-tile.svg";
