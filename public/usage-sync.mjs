#!/usr/bin/env node
/* kimi.builders 用量同步脚本(本地运行,零依赖,Node 18+)

   做什么:扫描 Kimi Code CLI 本地会话记录
   ($KIMI_CODE_HOME/sessions/.../agents/.../wire.jsonl,默认 ~/.kimi-code),
   把每个 step.end 事件里的 token 用量按【本地日期】汇总,上传到
   kimi.builders 的 /api/usage/sync(按天幂等,重复跑不会重复计)。

   不上传:任何对话内容、文件路径、项目名 —— 只有按天汇总的数字。

   用法:
     node usage-sync.mjs --handle <你的handle> --secret <同步密钥>
     HANDLE=aklmans USAGE_SYNC_SECRET=... node usage-sync.mjs
     node usage-sync.mjs --days 30        # 只同步最近 30 天(默认 60)

   同步密钥在 https://kimi.builders/usage 页面查看(站点管理员配置)。 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const args = process.argv.slice(2);
function arg(name, env, dflt) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return (env && process.env[env]) || dflt || "";
}
const HANDLE = arg("handle", "HANDLE").toLowerCase();
const SECRET = arg("secret", "USAGE_SYNC_SECRET");
const ENDPOINT = arg("endpoint", "SYNC_ENDPOINT", "https://kimi.builders").replace(/\/$/, "");
const DAYS = Number(arg("days", "", "60")) || 60;

if (!HANDLE || !SECRET) {
  console.error("需要 --handle 和 --secret(或 HANDLE / USAGE_SYNC_SECRET 环境变量)");
  process.exit(1);
}

const HOME = process.env.KIMI_CODE_HOME || path.join(os.homedir(), ".kimi-code");
const SESSIONS = path.join(HOME, "sessions");

function* wireFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* wireFiles(p);
    else if (e.name === "wire.jsonl") yield p;
  }
}

/* day -> { tokensIn, tokensOut, tokensCached, activeSeconds, sessions:Set, messages } */
const byDay = new Map();
const seen = new Set(); // event uuid 去重
let files = 0;

function bucket(day) {
  let b = byDay.get(day);
  if (!b) {
    b = { tokensIn: 0, tokensOut: 0, tokensCached: 0, activeSeconds: 0, sessions: new Set(), messages: 0 };
    byDay.set(day, b);
  }
  return b;
}

for (const file of wireFiles(SESSIONS)) {
  files++;
  const sessionId = file.split(path.sep).slice(-3)[0] || "";
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.includes('"step.end"')) continue; // 快路径:非用量行不解析
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const ev = rec?.event;
    if (rec?.type !== "context.append_loop_event" || ev?.type !== "step.end" || !ev.usage) continue;
    if (ev.uuid) {
      if (seen.has(ev.uuid)) continue;
      seen.add(ev.uuid);
    }
    const t = typeof rec.time === "number" ? rec.time : Date.now();
    const d = new Date(t);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const b = bucket(day);
    const u = ev.usage;
    b.tokensIn += (u.inputOther || 0) + (u.inputCacheCreation || 0);
    b.tokensCached += u.inputCacheRead || 0;
    b.tokensOut += u.output || 0;
    b.activeSeconds += Math.round((ev.llmStreamDurationMs || 0) / 1000);
    b.messages += 1;
    if (sessionId) b.sessions.add(sessionId);
  }
}

if (byDay.size === 0) {
  console.error(`在 ${SESSIONS} 下没有找到任何用量记录。先用 Kimi Code 跑几个会话再同步。`);
  process.exit(1);
}

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - DAYS);
const cut = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

const days = [...byDay.entries()]
  .filter(([day]) => day >= cut)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([day, b]) => ({
    day,
    tokensIn: b.tokensIn,
    tokensOut: b.tokensOut,
    tokensCached: b.tokensCached,
    costMicros: 0, // v1 只记 token;估费后续按平台单价表加
    activeSeconds: b.activeSeconds,
    sessions: b.sessions.size,
    messages: b.messages,
  }));

console.log(`扫描 ${files} 个会话文件,${DAYS} 天内共 ${days.length} 天有用量:`);
for (const d of days) {
  console.log(
    `  ${d.day}  in=${d.tokensIn}  out=${d.tokensOut}  cached=${d.tokensCached}  msgs=${d.messages}`,
  );
}

const res = await fetch(`${ENDPOINT}/api/usage/sync`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ secret: SECRET, handle: HANDLE, days }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`同步失败 (${res.status}): ${text}`);
  process.exit(1);
}
console.log(`同步成功: ${text}`);
