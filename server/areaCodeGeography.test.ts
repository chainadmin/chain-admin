import assert from "node:assert/strict";
import test from "node:test";
import { resolveNanpAreaCodeState } from "./areaCodeGeography";

test("resolves well-known single-state area codes", () => {
  assert.equal(resolveNanpAreaCodeState("212"), "NY");
  assert.equal(resolveNanpAreaCodeState("716"), "NY");
  assert.equal(resolveNanpAreaCodeState("585"), "NY");
  assert.equal(resolveNanpAreaCodeState("305"), "FL");
  assert.equal(resolveNanpAreaCodeState("415"), "CA");
  assert.equal(resolveNanpAreaCodeState("312"), "IL");
});

test("returns undefined for an unmapped area code rather than guessing", () => {
  assert.equal(resolveNanpAreaCodeState("000"), undefined);
  assert.equal(resolveNanpAreaCodeState(""), undefined);
});
