import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeOutboundAttempt,
  SoftphoneOutboundCallCoordinator,
} from "../../lib/softphone-outbound-call";

test("a failed pre-attach attempt releases preparation and permits the next call", () => {
  const coordinator = new SoftphoneOutboundCallCoordinator();
  const first = coordinator.begin();
  let dialLocked = true;
  let preparing = true;

  assert.equal(completeOutboundAttempt(coordinator, first, () => {
    dialLocked = false;
    preparing = false;
  }), true);
  assert.equal(dialLocked, false);
  assert.equal(preparing, false);

  const second = coordinator.begin();
  assert.equal(coordinator.isCurrent(second), true);
  assert.notEqual(second, first);
});

test("a stale failed attempt cannot release a newer call's preparation", () => {
  const coordinator = new SoftphoneOutboundCallCoordinator();
  const first = coordinator.begin();
  const second = coordinator.begin();
  let releases = 0;

  assert.equal(completeOutboundAttempt(coordinator, first, () => { releases += 1; }), false);
  assert.equal(releases, 0);
  assert.equal(coordinator.isCurrent(second), true);
});