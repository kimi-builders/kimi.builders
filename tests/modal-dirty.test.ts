import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MODAL_DIRTY_EVENT,
  MODAL_DIRTY_RESET_EVENT,
  notifyModalDirty,
  notifyModalDirtyReset,
} from "../components/modal-dirty";

test("programmatic edits and resets emit distinct bubbling notifications", () => {
  const source = new EventTarget();
  const received: Event[] = [];
  source.addEventListener(MODAL_DIRTY_EVENT, (event) => received.push(event));
  source.addEventListener(MODAL_DIRTY_RESET_EVENT, (event) => received.push(event));
  notifyModalDirty(source);
  notifyModalDirtyReset(source);
  assert.deepEqual(received.map((event) => event.type), [MODAL_DIRTY_EVENT, MODAL_DIRTY_RESET_EVENT]);
  assert.ok(received.every((event) => event.bubbles));
  assert.doesNotThrow(() => notifyModalDirty(null));
  assert.doesNotThrow(() => notifyModalDirtyReset(null));
});

test("gallery changes notify before updating state; same-cover picks stay clean", () => {
  const picker = readFileSync(new URL("../components/CoverGalleryPicker.tsx", import.meta.url), "utf8");
  assert.match(picker, /if \(value === cover\.src\) return;\s+notifyModalDirty\(event\.currentTarget\);\s+onPick\(cover\.src\)/);
  assert.match(picker, /notifyModalDirty\(event\.currentTarget\);\s+onClear\(\)/);
  assert.doesNotMatch(picker, /new Event\("change"|bubbleChange/);
});

test("modal dirty notifications stay scoped, guarded and cleaned up", () => {
  const modal = readFileSync(new URL("../app/(app)/_components/RouteModal.tsx", import.meta.url), "utf8");
  assert.match(modal, /const hasDirtyGuard = Boolean\(dirtyGuard\)/);
  assert.match(modal, /const markDirty = \(\) => \{\s+if \(hasDirtyGuard\) setDirty\(true\)/);
  assert.match(modal, /body\.addEventListener\(MODAL_DIRTY_EVENT, markDirty\)/);
  assert.match(modal, /body\.removeEventListener\(MODAL_DIRTY_EVENT, markDirty\)/);
  assert.match(modal, /body\.removeEventListener\(MODAL_DIRTY_RESET_EVENT, reset\)/);
});
