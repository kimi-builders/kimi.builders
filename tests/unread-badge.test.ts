import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawer = readFileSync(
  new URL("../app/(app)/_components/MobileNavDrawer.tsx", import.meta.url),
  "utf8",
);

test("the signed-out mobile drawer does not mount the unread poller", () => {
  /* The drawer remains mounted at desktop breakpoints even while CSS
     hides it. Keep the gated notifications link available to signed-
     out visitors, but do not create a polling badge until a session
     exists; otherwise every anonymous shell logs a 401 every 45s. */
  assert.match(
    drawer,
    /\{loggedIn && \(\s*<UnreadBadge[\s\S]*?\/>\s*\)\}/,
  );
});
