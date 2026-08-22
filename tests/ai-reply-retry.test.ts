import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_REPLY_MAX_ATTEMPTS,
  aiReplyRetryDelayMs,
  aiReplySwitchesAllow,
  isAiReplyRetryDue,
} from "../src/lib/ai-reply";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

test("retry delay grows exponentially: 10 * 2^n minutes", () => {
  assert.equal(aiReplyRetryDelayMs(0), 10 * 60_000);
  assert.equal(aiReplyRetryDelayMs(1), 20 * 60_000);
  assert.equal(aiReplyRetryDelayMs(2), 40 * 60_000);
  assert.equal(aiReplyRetryDelayMs(3), 80 * 60_000);
});

test("pending jobs become due after 10 idle minutes", () => {
  const base = { status: "pending", attempts: 0, lastAttemptAt: null };
  assert.equal(isAiReplyRetryDue({ ...base, createdAt: minutesAgo(9) }, NOW), false);
  assert.equal(isAiReplyRetryDue({ ...base, createdAt: minutesAgo(10) }, NOW), true);
  assert.equal(isAiReplyRetryDue({ ...base, createdAt: minutesAgo(11) }, NOW), true);
});

test("failed jobs wait 10 * 2^attempts minutes since the last attempt", () => {
  /* First-run failure (attempts=0, no last_attempt_at yet) waits 10
     minutes from enqueue time. */
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 0, lastAttemptAt: null, createdAt: minutesAgo(10) },
      NOW,
    ),
    true,
  );
  /* After retry 1 (attempts=1), at least 20 minutes apart. */
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 1, lastAttemptAt: minutesAgo(19), createdAt: minutesAgo(60) },
      NOW,
    ),
    false,
  );
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 1, lastAttemptAt: minutesAgo(20), createdAt: minutesAgo(60) },
      NOW,
    ),
    true,
  );
  /* After retry 2 (attempts=2), at least 40 minutes apart. */
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 2, lastAttemptAt: minutesAgo(39), createdAt: minutesAgo(120) },
      NOW,
    ),
    false,
  );
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 2, lastAttemptAt: minutesAgo(40), createdAt: minutesAgo(120) },
      NOW,
    ),
    true,
  );
});

test("jobs at the attempts cap are never due again", () => {
  assert.equal(AI_REPLY_MAX_ATTEMPTS, 3);
  assert.equal(
    isAiReplyRetryDue(
      { status: "failed", attempts: 3, lastAttemptAt: minutesAgo(10_000), createdAt: minutesAgo(20_000) },
      NOW,
    ),
    false,
  );
  /* A pending leftover (process killed after claiming) at the cap is
     never scanned again. */
  assert.equal(
    isAiReplyRetryDue(
      { status: "pending", attempts: 3, lastAttemptAt: minutesAgo(10_000), createdAt: minutesAgo(20_000) },
      NOW,
    ),
    false,
  );
});

test("terminal statuses are never due", () => {
  const base = { attempts: 0, lastAttemptAt: null, createdAt: minutesAgo(10_000) };
  assert.equal(isAiReplyRetryDue({ ...base, status: "done" }, NOW), false);
  assert.equal(isAiReplyRetryDue({ ...base, status: "skipped" }, NOW), false);
});

test("both switches must be on to allow a reply", () => {
  assert.equal(aiReplySwitchesAllow({ aiReply: 1, aiRepliesEnabled: 1 }), true);
  assert.equal(aiReplySwitchesAllow({ aiReply: 0, aiRepliesEnabled: 1 }), false);
  assert.equal(aiReplySwitchesAllow({ aiReply: 1, aiRepliesEnabled: 0 }), false);
  assert.equal(aiReplySwitchesAllow({ aiReply: 0, aiRepliesEnabled: 0 }), false);
  assert.equal(aiReplySwitchesAllow({ aiReply: null, aiRepliesEnabled: true }), false);
});
