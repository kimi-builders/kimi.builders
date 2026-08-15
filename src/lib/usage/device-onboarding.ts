/* 用量设备 onboarding 的单一事实源(2026-08-14):三条 CLI 命令与其口径文案。
   首开引导(UsageFirstRun)、「同步数据」弹窗、设备连接页都从这里取,
   改命令或措辞只动这一个文件;usage-device-onboarding.test.ts 钉住文案契约
   (如「init 只授权,不扫描不上传」)。 */
export const USAGE_DASHBOARD_COMMAND = "npx @kimi.builders/usage@latest dashboard";
export const USAGE_INIT_COMMAND = "npx @kimi.builders/usage@latest init";
export const USAGE_SYNC_COMMAND = "npx @kimi.builders/usage@latest sync";

export function usageInitMeaning(zh: boolean): string {
  return zh
    ? "init 只完成设备授权，不扫描、不上传。批准后请在本地看板选择 Agent 的扫描与社区同步范围，再明确开始同步。"
    : "init only authorizes this device; it does not scan or upload. After approval, choose each agent’s local and community scope in the local dashboard, then explicitly start sync.";
}

export function usageDashboardConnectionGuide(zh: boolean): string {
  return zh
    ? "推荐先打开本地看板，再点“同步数据 → 连接社区账户”。验证码、倒计时、同步范围和断开操作都可在页面中完成。"
    : "Open the local dashboard, then choose “Sync data → Connect community account.” The code, countdown, sync scope, and disconnect controls all stay in the UI.";
}

export function usageSyncMeaning(zh: boolean): string {
  return zh
    ? "已有设备授权时，sync 只上传你在该设备明确标为“本机并同步”的 Agent 增量。"
    : "With an authorized device, sync uploads only incremental data from agents explicitly marked “Local + sync” on that device.";
}
