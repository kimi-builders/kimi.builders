/* 站点默认气质(20260822 起可配置):视觉气质双档 poster=工程棱角 /
   soft=圆润经典(globals.css 的 data-vibe 块承载形态语言)。
   未设 kb_vibe cookie 时的落点、设置页「默认」徽标、切换/兜底动作的
   回落值,三处同用 DEFAULT_VIBE 这一事实源——改这一处即换全站默认。
   本文件客户端安全(纯常量 + 纯函数,单测直接测);cookie 读取在
   prefs.ts(next/headers,仅服务端)。 */
export type Vibe = "poster" | "soft";

export const DEFAULT_VIBE: Vibe = "soft";

/* cookie/表单值归一:合法两档原样过,其余(缺失/脏值)回落站点默认。 */
export function normalizeVibe(value: string | null | undefined): Vibe {
  return value === "poster" || value === "soft" ? value : DEFAULT_VIBE;
}
