import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, isTransientGatewayError, parseErrorResponse } from "../../lib/queryClient";

test("HTML gateway responses become a safe retry message", async () => {
  const parsed = await parseErrorResponse(new Response(
    "<!doctype html><title>502 Bad gateway</title><p>provider details</p>",
    { status: 502, headers: { "content-type": "text/html; charset=UTF-8" } },
  ));

  assert.deepEqual(parsed, {
    message: "The server is temporarily unavailable. No changes were made; please try again.",
  });
});

test("only transient gateway errors are eligible for safe preflight retry", () => {
  assert.equal(isTransientGatewayError(new ApiError(502, "Bad gateway", null)), true);
  assert.equal(isTransientGatewayError(new ApiError(503, "Unavailable", null)), true);
  assert.equal(isTransientGatewayError(new ApiError(504, "Timeout", null)), true);
  assert.equal(isTransientGatewayError(new ApiError(500, "Application error", null)), false);
  assert.equal(isTransientGatewayError(new ApiError(409, "Conflict", null)), false);
});