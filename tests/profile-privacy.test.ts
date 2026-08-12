import assert from "node:assert/strict";
import test from "node:test";
import { profileDisplay, type UserProfile } from "../src/lib/users";

/* 资料字段级隐私(20260829_profile_privacy)的展示口径:
   头像隐藏 → 空串(页面回落 handle 首字符);显示名隐藏 → 只显示 @handle;
   简介隐藏 → 空串(简介区不渲染)。本人视角不受限(开关对自己无效)。 */

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 3,
    handle: "aklman",
    name: "Aklman Zhapar",
    avatarUrl: "https://cdn.example.com/a.webp",
    bio: "独立开发者。",
    showAvatar: true,
    showName: true,
    showBio: true,
    role: "member",
    createdAt: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

test("default (all public): visitor sees the full profile", () => {
  const view = profileDisplay(profile(), false);
  assert.equal(view.avatarUrl, "https://cdn.example.com/a.webp");
  assert.equal(view.displayName, "Aklman Zhapar");
  assert.equal(view.bio, "独立开发者。");
});

test("each switch hides only its own field for visitors", () => {
  const noAvatar = profileDisplay(profile({ showAvatar: false }), false);
  assert.equal(noAvatar.avatarUrl, "");
  assert.equal(noAvatar.displayName, "Aklman Zhapar");
  assert.equal(noAvatar.bio, "独立开发者。");

  const noName = profileDisplay(profile({ showName: false }), false);
  assert.equal(noName.displayName, "@aklman");
  assert.equal(noName.avatarUrl, "https://cdn.example.com/a.webp");

  const noBio = profileDisplay(profile({ showBio: false }), false);
  assert.equal(noBio.bio, "");
  assert.equal(noBio.displayName, "Aklman Zhapar");
});

test("self view ignores the switches entirely", () => {
  const view = profileDisplay(
    profile({ showAvatar: false, showName: false, showBio: false }),
    true,
  );
  assert.equal(view.avatarUrl, "https://cdn.example.com/a.webp");
  assert.equal(view.displayName, "Aklman Zhapar");
  assert.equal(view.bio, "独立开发者。");
});

test("empty name falls back to bare handle; hidden name renders @handle", () => {
  assert.equal(profileDisplay(profile({ name: "" }), false).displayName, "aklman");
  assert.equal(
    profileDisplay(profile({ name: "", showName: false }), false).displayName,
    "@aklman",
  );
});
