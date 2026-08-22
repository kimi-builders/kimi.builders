/* Manually rerun an AI reply job (through the real processAiReply, no
   bypass): npx tsx scripts/ai-reply-retry.ts <jobId>. The logic lives
   in retryAiReplyJob in src/lib/ai-reply.ts (shared with the cron batch
   recovery); this only parses args and prints. Needs DATABASE_URL and
   KIMI_API_KEY in the environment (locally: source .env.local). */
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
