/* 手动重跑 AI 回帖任务(走真实 processAiReply,不是旁路):
     npx tsx scripts/ai-reply-retry.ts <jobId>
   执行逻辑在 src/lib/ai-reply.ts 的 retryAiReplyJob(与 cron 批量恢复共用),
   这里只做参数解析和打印。需要环境里有 DATABASE_URL 和 KIMI_API_KEY
   (本地:source .env.local)。 */
import { retryAiReplyJob } from "../src/lib/ai-reply";

async function main() {
  const jobId = Number(process.argv[2]);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    console.error("usage: npx tsx scripts/ai-reply-retry.ts <jobId>");
    process.exit(1);
  }

  const { retried, job } = await retryAiReplyJob(jobId);
  if (!retried) {
    console.log(`job ${jobId}: 不存在或已是 done,未动`);
  }
  console.log(job);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
