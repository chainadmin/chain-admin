import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  matchesRemovalTargetName,
  normalizedRemovalTargetName,
} from "../../lib/removalConfirmation";

test("removal confirmation ignores accidental surrounding database whitespace", () => {
  assert.equal(normalizedRemovalTargetName(" Perimeter "), "Perimeter");
  assert.equal(matchesRemovalTargetName("Perimeter", "Perimeter "), true);
  assert.equal(matchesRemovalTargetName("perimeter", "Perimeter "), false);
});

test("Global Admin selects the active product instead of hardcoding Chain", () => {
  const source = readFileSync(new URL("../global-admin.tsx", import.meta.url), "utf8");
  assert.match(source, /selectedAgencyForDeletion\.chainCoreEnabled\s*\?\s*"CHAIN"\s*:\s*"CHIAMO"/);
});