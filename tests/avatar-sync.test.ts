import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  shouldSyncProviderAvatar,
  syncProviderAvatar,
} from "../src/lib/auth/users";
import {
  isAllowedAvatarUrl,
  isOwnAvatarUrl,
  OAUTH_AVATAR_EXACT_HOSTS,
  OAUTH_AVATAR_HOST_SUFFIXES,
} from "../src/lib/avatar-urls";
import type { Pool } from "mysql2/promise";

/* provider 头像同步与可持久化 URL 白名单。 */

const CDN_AVATAR = "https://cdn.kimi.builders/avatar/202608/0123456789abcdef.webp";
const PROVIDER_AVATAR = "https://avatars.githubusercontent.com/u/12345?v=4";

test("isOwnAvatarUrl: CDN host match counts as own (default base)", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(isOwnAvatarUrl(CDN_AVATAR), true);
  /* 同 host 的其他 key 前缀(logo/image)也算自家 CDN,同样不覆盖 */
  assert.equal(
    isOwnAvatarUrl("https://cdn.kimi.builders/logo/202608/0123456789abcdef.webp"),
    true,
  );
});

test("isOwnAvatarUrl: off-host /avatar/ paths and relative keys are never trusted", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(
    isOwnAvatarUrl("https://old-cdn.example.com/avatar/202501/0123456789abcdef.webp"),
    false,
  );
  assert.equal(isOwnAvatarUrl("/avatar/202501/0123456789abcdef.webp"), false);
});

test("isOwnAvatarUrl: external provider URLs are not own", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(isOwnAvatarUrl(PROVIDER_AVATAR), false);
  assert.equal(
    isOwnAvatarUrl("https://lh3.googleusercontent.com/a/abc123"),
    false,
  );
  assert.equal(isOwnAvatarUrl(""), false);
});

test("isOwnAvatarUrl: honors R2_PUBLIC_BASE_URL override", () => {
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";
  try {
    assert.equal(
      isOwnAvatarUrl("https://media.example.com/avatar/202608/0123456789abcdef.webp"),
      true,
    );
    /* 配置切换后只认新 host，不再按路径把旧/外部域冒充为自有。 */
    assert.equal(isOwnAvatarUrl(CDN_AVATAR), false);
    assert.equal(
      isOwnAvatarUrl("https://cdn.kimi.builders/image/202608/0123456789abcdef.webp"),
      false,
    );
  } finally {
    delete process.env.R2_PUBLIC_BASE_URL;
  }
});

test("shouldSyncProviderAvatar: empty current avatar syncs", () => {
  assert.equal(shouldSyncProviderAvatar(""), true);
  assert.equal(shouldSyncProviderAvatar(null), true);
  assert.equal(shouldSyncProviderAvatar(undefined), true);
  assert.equal(shouldSyncProviderAvatar("   "), true);
});

test("shouldSyncProviderAvatar: provider/external avatar syncs (not yet customized)", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(shouldSyncProviderAvatar(PROVIDER_AVATAR), true);
});

test("shouldSyncProviderAvatar: own uploaded avatar is never overwritten", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.equal(shouldSyncProviderAvatar(CDN_AVATAR), false);
  assert.equal(
    shouldSyncProviderAvatar("https://old-cdn.example.com/avatar/202501/0123456789abcdef.webp"),
    true,
  );
});

test("avatar allowlist accepts exact CDN/provider hosts and rejects suffix tricks", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  assert.deepEqual(OAUTH_AVATAR_EXACT_HOSTS, ["avatars.githubusercontent.com"]);
  assert.deepEqual(OAUTH_AVATAR_HOST_SUFFIXES, [".googleusercontent.com"]);
  assert.equal(isAllowedAvatarUrl(CDN_AVATAR), true);
  assert.equal(isAllowedAvatarUrl(PROVIDER_AVATAR), true);
  assert.equal(isAllowedAvatarUrl("https://lh3.googleusercontent.com/a/abc"), true);
  assert.equal(isAllowedAvatarUrl("https://googleusercontent.com/a/abc"), true);
  assert.equal(isAllowedAvatarUrl("https://evil.example/avatar/x.webp"), false);
  assert.equal(isAllowedAvatarUrl("https://avatars.githubusercontent.com.evil.example/u/1"), false);
  assert.equal(isAllowedAvatarUrl("https://evilgoogleusercontent.com/a/abc"), false);
  assert.equal(isAllowedAvatarUrl("http://avatars.githubusercontent.com/u/1"), false);
});

test("settings action uses the shared allowlist and a host-specific localized error", () => {
  const source = readFileSync(
    new URL("../app/(app)/settings/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /isAllowedAvatarUrl\(avatarUrl\)/);
  assert.match(source, /err\.avatarHostInvalid/);
});

test("provider sync pins the previously read avatar in the UPDATE WHERE (TOCTOU guard)", async () => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const fake = {
    async query(sql: string, args: unknown[]) {
      calls.push({ sql, args });
      if (sql.startsWith("SELECT")) return [[{ avatar_url: PROVIDER_AVATAR }]];
      /* affectedRows=0 simulates a custom avatar winning between SELECT and UPDATE. */
      return [{ affectedRows: 0 }];
    },
  } as unknown as Pool;
  assert.equal(
    await syncProviderAvatar(fake, 7, "https://avatars.githubusercontent.com/u/12345?v=8"),
    false,
  );
  assert.match(calls[1].sql, /WHERE id = \? AND avatar_url = \?/);
  assert.deepEqual(calls[1].args, [
    "https://avatars.githubusercontent.com/u/12345?v=8",
    7,
    PROVIDER_AVATAR,
  ]);
});
