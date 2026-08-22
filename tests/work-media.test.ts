import assert from "node:assert/strict";
import test from "node:test";
import {
  areWorkImageKeys,
  isWorkLogoKey,
  isWorkMediaKey,
  parseWorkImageKeysInput,
  WORK_IMAGE_MAX,
} from "../src/lib/work-media";

/* Work media key validation: keys must match the shape minted by
   /api/upload — (logo|image)/yyyyMM/<hash16>.webp — with the shape +
   prefix allowlist re-checked before the write. */

const LOGO_KEY = "logo/202608/0123456789abcdef.webp";
const IMAGE_KEY = "image/202601/abcdef0123456789.webp";
const IMAGE_KEY_2 = "image/202612/ffffffffffffffff.webp";

test("isWorkMediaKey: accepts upload-issued key shapes", () => {
  assert.equal(isWorkMediaKey(LOGO_KEY), true);
  assert.equal(isWorkMediaKey(IMAGE_KEY), true);
});

test("isWorkMediaKey: rejects anything off the issued shape", () => {
  /* avatar is a valid upload kind but not an allowed work-media
     prefix. */
  assert.equal(isWorkMediaKey("avatar/202608/0123456789abcdef.webp"), false);
  /* The month must be 6 digits, the hash 16 lowercase hex chars, the
     extension webp. */
  assert.equal(isWorkMediaKey("logo/20268/0123456789abcdef.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcde.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcdef0.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789ABCDEF.webp"), false);
  assert.equal(isWorkMediaKey("logo/202608/0123456789abcdef.png"), false);
  /* Path traversal / absolute URLs / query strings / empty. */
  assert.equal(isWorkMediaKey("image/202608/../23456789abcdef.webp"), false);
  assert.equal(isWorkMediaKey(`https://cdn.kimi.builders/${IMAGE_KEY}`), false);
  assert.equal(isWorkMediaKey(`${IMAGE_KEY}?v=1`), false);
  assert.equal(isWorkMediaKey(""), false);
  assert.equal(isWorkMediaKey(`/${IMAGE_KEY}`), false);
});

test("isWorkLogoKey: empty means none; non-empty must be logo-prefixed", () => {
  assert.equal(isWorkLogoKey(""), true);
  assert.equal(isWorkLogoKey(LOGO_KEY), true);
  /* An image/-prefixed key can't serve as the logo (the cropped
     square-512 semantics live under logo/). */
  assert.equal(isWorkLogoKey(IMAGE_KEY), false);
  assert.equal(isWorkLogoKey("logo/202608/not-hex-sha1!!.webp"), false);
});

test("areWorkImageKeys: ≤9 image-prefixed keys, order is semantics (first = cover)", () => {
  assert.equal(areWorkImageKeys([]), true);
  assert.equal(areWorkImageKeys([IMAGE_KEY]), true);
  assert.equal(areWorkImageKeys(Array(WORK_IMAGE_MAX).fill(IMAGE_KEY)), true);
  /* The 10th image is over the cap. */
  assert.equal(areWorkImageKeys(Array(WORK_IMAGE_MAX + 1).fill(IMAGE_KEY)), false);
  /* Mixed logo prefixes / invalid shapes all reject. */
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
  /* Invalid JSON / non-array / non-string members -> null (callers
     treat as validation failure). */
  assert.equal(parseWorkImageKeysInput("not json"), null);
  assert.equal(parseWorkImageKeysInput('{"a":1}'), null);
  assert.equal(parseWorkImageKeysInput(`["${IMAGE_KEY}",1]`), null);
  assert.equal(parseWorkImageKeysInput(`"${IMAGE_KEY}"`), null);
});

test("WORK_IMAGE_MAX stays at the 9-image product cap", () => {
  assert.equal(WORK_IMAGE_MAX, 9);
});
