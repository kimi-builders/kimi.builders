/* 快捷键触发守卫(20260822 快捷键层):纯函数,单测直接测。
   规则(方案定稿):
   1. 带 ⌘/Ctrl/Alt 修饰不触发(不碰浏览器保留组合;⌘K 归搜索自己的监听);
   2. 输入态(焦点在 input/textarea/select/contenteditable 或任何弹窗内)
      不触发——搜索框里打字不被劫持;
   3. 有弹窗开着时不触发(只有 Esc 与 ? 面板自身例外,见调用方);
   4. IME 组合中(isComposing)不触发。
   Shift 不在此拦:"?" 本身就是 Shift+/,字母键的 Shift 过滤由调用方自决。 */
export interface ShortcutGuardEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

export function isPlainShortcutContext(
  ev: ShortcutGuardEvent,
  target: Element | null,
  dialogOpen: boolean,
): boolean {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  if (ev.isComposing) return false;
  if (dialogOpen) return false;
  if (target?.closest("input, textarea, select, [contenteditable='true'], dialog")) {
    return false;
  }
  return true;
}

/* 事件目标是否在可编辑区(不依赖弹窗态;? 呼出面板用它做输入态豁免) */
export function isEditableTarget(target: Element | null): boolean {
  return !!target?.closest("input, textarea, select, [contenteditable='true']");
}
