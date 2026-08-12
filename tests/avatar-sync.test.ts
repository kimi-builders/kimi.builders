import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnAvatarUrl,
  shouldSyncProviderAvatar,
} from "../src/lib/auth/users";

/* provider 头像同步的防覆盖判定(src/lib/auth/users.ts):
   站内自传头像 = 指向自家 CDN(R2_PUBLIC_BASE_URL 的 host)或 /avatar/ 前缀路径;
   当前头像为空或非自有 → 允许 provider 同步;自有头像 → 不冲掉。 */

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

test("isOwnAvatarUrl: /avatar/ path prefix counts as own even off-CDN host", () => {
  delete process.env.R2_PUBLIC_BASE_URL;
  /* 换 CDN 域名前的存量数据:host 不同,但路径形状仍是站内头像 key */
  assert.equal(
    isOwnAvatarUrl("https://old-cdn.example.com/avatar/202501/0123456789abcdef.webp"),
    true,
  );
  assert.equal(isOwnAvatarUrl("/avatar/202501/0123456789abcdef.webp"), true);
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
    /* 默认域名此时不再算自有(配置已指向别的 host),但 /avatar/ 前缀仍兜底 */
    assert.equal(isOwnAvatarUrl(CDN_AVATAR), true);
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
    false,
  );
});
