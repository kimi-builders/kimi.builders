import assert from "node:assert/strict";
import test from "node:test";
import {
  contentSearchPattern,
  escapeLike,
  isSearchableQuery,
} from "../src/lib/site-content-search";

test("escapeLike neutralizes user-supplied wildcards", () => {
  assert.equal(escapeLike("100%_ok\\"), "100\\%\\_ok\\\\");
});

test("contentSearchPattern wraps the trimmed escaped term", () => {
  assert.equal(contentSearchPattern("  kim% "), "%kim\\%%");
});

test("isSearchableQuery gates on trimmed length", () => {
  assert.equal(isSearchableQuery("k"), false);
  assert.equal(isSearchableQuery("  k  "), false);
  assert.equal(isSearchableQuery("kb"), true);
  assert.equal(isSearchableQuery("x".repeat(65)), false);
  assert.equal(isSearchableQuery("x".repeat(64)), true);
});
