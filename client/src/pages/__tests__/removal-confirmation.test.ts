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

test("force purge requires explicit irreversible confirmation and reaches the server", () => {
  const source = readFileSync(
    new URL("../../components/global-admin/removal-confirmation.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /forcePermanentDelete: true, purgeConfirmation/);
  assert.match(source, /purgeConfirmation === "PERMANENTLY DELETE"/);
  assert.match(source, /forcePermanentDelete=true/);
  assert.match(source, /Finalized signed legal documents still prevent a purge/);
});