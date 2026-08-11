import assert from "node:assert/strict";
import test from "node:test";
import {
  areWorkImageKeys,
  isWorkLogoKey,
  isWorkMediaKey,
  parseWorkImageKeysInput,
  WORK_IMAGE_MAX,
} from "../src/lib/work-media";

/* 作品媒体 key 校验(20260826_work_media):key 只能来自 /api/upload 的颁发形状
   (logo|image)/yyyyMM/<hash16>.webp,写库前按形状 + 前缀白名单再挡一次。 */

const LOGO_KEY = "logo/202608/0123456789abcdef.webp";
const IMAGE_KEY = "image/202601/abcdef0123456789.webp";
const IMAGE_KEY_2 = "image/202612/ffffffffffffffff.webp";

test("isWorkMediaKey: accepts upload-issued key shapes", () => {
  assert.equal(isWorkMediaKey(LOGO_KEY), true);
  assert.equal(isWorkMediaKey(IMAGE_KEY), true);
});

test("isWorkMediaKey: rejects anything off the issued shape", () => {
  /* avatar 是合法上传 kind,但不是作品媒体的允许前缀 */
  assert.equal(isWorkMediaKey("avatar/202608/0123456789abcdef.webp"), false);
  /* 月份必须 6 位、hash 必须 16 位小写 hex、扩展名必须 webp */
  assert.equal(isWorkMediaKey("logo/20268/0123456789abcdef.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcde.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcdef0.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789ABCDEF.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcdef.png"), false);
  /* 路径穿越 / 绝对 URL / 查询串 / 空串 */
  assert.equal(isWorkMediaKey("image/202608/../23456789abcdef.webp"), false);
  assert.equal(isWorkMediaKey(`https://cdn.kimi.builders/${IMAGE_KEY}`), false);
  assert.equal(isWorkMediaKey(`${IMAGE_KEY}?v=1`), false);
  assert.equal(isWorkMediaKey(""), false);
  assert.equal(isWorkMediaKey(`/${IMAGE_KEY}`), false);
});

test("isWorkLogoKey: empty means none; non-empty must be logo-prefixed", () => {
  assert.equal(isWorkLogoKey(""), true);
  assert.equal(isWorkLogoKey(LOGO_KEY), true);
  /* image 前缀的 key 不能当 Logo 用(裁剪后的方形 512 语义在 logo/ 上) */
  assert.equal(isWorkLogoKey(IMAGE_KEY), false);
  assert.equal(isWorkLogoKey("logo/202608/not-hex-sha1!!.webp"), false);
});

test("areWorkImageKeys: ≤9 image-prefixed keys, order is semantics (first = cover)", () => {
  assert.equal(areWorkImageKeys([]), true);
  assert.equal(areWorkImageKeys([IMAGE_KEY]), true);
  assert.equal(areWorkImageKeys(Array(WORK_IMAGE_MAX).fill(IMAGE_KEY)), true);
  /* 第 10 张越界 */
  assert.equal(areWorkImageKeys(Array(WORK_IMAGE_MAX + 1).fill(IMAGE_KEY)), false);
  /* 混入 logo 前缀 / 非法形状都拒 */
  assert.equal(areWorkImageKeys([IMAGE_KEY, LOGO_KEY]), false);
  assert.equal(areWorkImageKeys([IMAGE_KEY, "image/202608/xyz.webp"]), false);
  assert.equal(areWorkImageKeys([""]), false);
});

test("parseWorkImageKeysInput: hidden-field JSON parse, garbage is null not swallowed", () => {
  assert.deepEqual(parseWorkImageKeysInput(""), []);
  assert.deepEqual(parseWorkImageKeysInput("   "), []);
  assert.deepEqual(parseWorkImageKeysInput(`["${IMAGE_KEY}"]`), [IMAGE_KEY]);
  assert.deepEqual(parseWorkImageKeysInput(`["${IMAGE_KEY}","${IMAGE_KEY_2}"]`), [
    IMAGE_KEY,
    IMAGE_KEY_2,
  ]);
  /* 非法 JSON / 非数组 / 非字符串成员 → null(调用方按校验失败处理) */
  assert.equal(parseWorkImageKeysInput("not json"), null);
  assert.equal(parseWorkImageKeysInput('{"a":1}'), null);
  assert.equal(parseWorkImageKeysInput(`["${IMAGE_KEY}",1]`), null);
  assert.equal(parseWorkImageKeysInput(`"${IMAGE_KEY}"`), null);
});

test("WORK_IMAGE_MAX stays at the 9-image product cap", () => {
  assert.equal(WORK_IMAGE_MAX, 9);
});
