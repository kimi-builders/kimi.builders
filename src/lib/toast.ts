/* 轻量 toast:客户端任意处 toast("...") 即弹一条,出口是根布局的 <Toaster />。
   纯事件总线,无依赖;服务端(无 window)调用静默忽略。
   kind(20260815 评审):error 走红色语义 + 更长时长,与常规反馈分级;
   默认 info 维持旧行为,存量调用零改动。 */
export type ToastKind = "info" | "error";

export function toast(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("kb:toast", { detail: { message, kind } }));
}
