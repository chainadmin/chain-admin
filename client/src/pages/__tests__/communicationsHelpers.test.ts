import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SUMMARY_ORDER,
  normalizeSummaryOrder,
  type SummaryBlock,
} from "../communicationsHelpers";

describe("normalizeSummaryOrder", () => {
  it("returns the default order when no order is provided", () => {
    const result = normalizeSummaryOrder(undefined, {
      includeAccount: true,
      includeCta: true,
    });

    assert.deepEqual(result, DEFAULT_SUMMARY_ORDER);
  });

  it("removes the CTA when it should not be included", () => {
    const result = normalizeSummaryOrder(["cta", "account", "cta"], {
      includeAccount: true,
      includeCta: false,
    });

    assert.deepEqual(result, ["account"] as SummaryBlock[]);
  });

  it("filters out sections that are not available", () => {
    const result = normalizeSummaryOrder(["cta"], {
      includeAccount: false,
      includeCta: false,
    });

    assert.deepEqual(result, [] as SummaryBlock[]);
  });

  it("adds missing sections when they should be present", () => {
    const result = normalizeSummaryOrder(["cta"], {
      includeAccount: true,
      includeCta: true,
    });

    assert.deepEqual(result, ["account", "cta"] as SummaryBlock[]);
  });
});
