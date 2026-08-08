/* 手动重跑 AI 回帖任务(走真实 processAiReply,不是旁路):
     npx tsx scripts/ai-reply-retry.ts <jobId>
   把非 done 的任务重置为 pending 再执行,最后打印结果状态。
   需要环境里有 DATABASE_URL 和 KIMI_API_KEY(本地:source .env.local)。 */
import { getPool } from "../src/lib/db";
import { processAiReply } from "../src/lib/ai-reply";

async function main() {
  const jobId = Number(process.argv[2]);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    console.error("usage: npx tsx scripts/ai-reply-retry.ts <jobId>");
    process.exit(1);
  }

  const [res] = await getPool().query(
    "UPDATE ai_reply_jobs SET status = 'pending', error = '' WHERE id = ? AND status != 'done'",
    [jobId],
  );
  if ((res as { affectedRows: number }).affectedRows === 0) {
    console.log(`job ${jobId}: 不存在或已是 done,未动`);
  } else {
    await processAiReply(jobId);
  }
  const [rows] = await getPool().query(
    "SELECT id, status, error FROM ai_reply_jobs WHERE id = ?",
    [jobId],
  );
  console.log((rows as unknown[])[0]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
