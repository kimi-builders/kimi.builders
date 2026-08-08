/* 轻量 toast:客户端任意处 toast("...") 即弹一条,出口是根布局的 <Toaster />。
   纯事件总线,无依赖;服务端(无 window)调用静默忽略。 */
export function toast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("kb:toast", { detail: message }));
}
