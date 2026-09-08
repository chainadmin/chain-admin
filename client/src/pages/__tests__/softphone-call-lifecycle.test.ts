import assert from "node:assert/strict";
import test from "node:test";
import {
  SoftphoneCallController,
  dedupeStatus,
  providerErrorMessage,
  pendingReconnectStorageKey,
  type LifecycleCallbacks,
  type PendingReconnect,
  type ProviderCall,
  type ReconnectStorage,
} from "../../lib/softphone-call-lifecycle";
import { updateLiveDeviceToken } from "../../lib/softphone-call-device";
import { SoftphoneOutboundCallCoordinator } from "../../lib/softphone-outbound-call";
import {
  cancelReconnect as requestCancelReconnect,
  requestReconnect,
  retainAgentCall,
} from "../../lib/softphone-call-requests";

class FakeCall implements ProviderCall {
  parameters: Record<string, string | undefined>;
  customParameters?: Map<string, string>;
  accepted = 0;
  rejected = 0;
  disconnected = 0;
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  constructor(options: { sid?: string; retainedId?: string; token?: string } = {}) {
    this.parameters = { CallSid: options.sid };
    if (options.retainedId || options.token) {
      this.customParameters = new Map();
      if (options.retainedId) this.customParameters.set("RetainedCallId", options.retainedId);
      if (options.token) this.customParameters.set("ReconnectToken", options.token);
    }
  }

  accept() { this.accepted += 1; }
  reject() { this.rejected += 1; }
  disconnect() { this.disconnected += 1; this.emit("disconnect"); }
  on(event: string, listener: (...args: any[]) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) || []), listener]);
  }
  emit(event: string, value?: unknown) {
    for (const listener of this.listeners.get(event) || []) listener(value);
  }
}

function controllerHarness(sessionId = "tenant:user", storage?: ReconnectStorage, now?: number) {
  const controller = new SoftphoneCallController();
  const events = { active: [] as FakeCall[], ended: [] as FakeCall[], incoming: [] as FakeCall[], errors: [] as string[] };
  const callbacks: LifecycleCallbacks = {
    onActive: (call) => events.active.push(call as FakeCall),
    onEnded: (call) => events.ended.push(call as FakeCall),
    onIncoming: (call) => events.incoming.push(call as FakeCall),
    onIncomingCleared: () => {},
    onReconnectChanged: () => {},
    onError: (message) => events.errors.push(message),
  };
  controller.configure(callbacks);
  controller.startSession(sessionId, storage, now);
  return { controller, events };
}

test("a stale disconnect cannot clear a newer active call", () => {
  const { controller, events } = controllerHarness();
  const oldCall = new FakeCall({ sid: "old" });
  const newCall = new FakeCall({ sid: "new" });
  controller.attachActive(oldCall);
  controller.attachActive(newCall);
  oldCall.emit("disconnect");
  assert.equal(controller.getActiveCall(), newCall);
  assert.deepEqual(events.ended, []);
  newCall.emit("disconnect");
  assert.deepEqual(events.ended, [newCall]);
});

test("matching recovery waits for the asynchronous accept event even when incoming precedes HTTP response", () => {
  const { controller, events } = controllerHarness();
  const cancelled: PendingReconnect[] = [];
  controller.beginReconnect("held", "held-1", "nonce-1", "Caller", "+1555", {
    timeoutMs: 60_000,
    cancel: async (pending) => { cancelled.push(pending); },
  });
  const incoming = new FakeCall({ retainedId: "held-1", token: "nonce-1" });
  assert.equal(controller.receiveIncoming(incoming), "recovered");
  assert.equal(incoming.accepted, 1);
  assert.equal(controller.getActiveCall(), null);
  assert.equal(controller.getPendingReconnect()?.id, "held-1");
  assert.deepEqual(events.active, []);
  incoming.emit("accept");
  assert.equal(controller.getActiveCall(), incoming);
  assert.equal(controller.getPendingReconnect(), null);
  assert.deepEqual(events.active, [incoming]);
  assert.deepEqual(cancelled, []);
  // A late successful HTTP response cannot replace the accepted call.
  assert.equal(controller.confirmReconnect({
    id: "held-1", token: "nonce-1", expiresAt: new Date(Date.now() + 10_000).toISOString(),
    callerName: "Caller", callerNumber: "+1555",
  }), false);
});

test("unrelated and stale retained incoming calls are never auto-accepted", () => {
  const { controller } = controllerHarness();
  controller.beginReconnect("parked", "park-1", "wanted", "", "+1555", {
    timeoutMs: 60_000,
    cancel: async () => {},
  });
  const unrelated = new FakeCall();
  assert.equal(controller.receiveIncoming(unrelated), "incoming");
  assert.equal(unrelated.accepted, 0);
  controller.rejectIncoming(unrelated);

  const wrongNonce = new FakeCall({ retainedId: "park-1", token: "wrong" });
  assert.equal(controller.receiveIncoming(wrongNonce), "rejected");
  assert.equal(wrongNonce.accepted, 0);
  assert.equal(wrongNonce.rejected, 1);

  controller.startSession("other:user");
  const staleSession = new FakeCall({ retainedId: "park-1", token: "wanted" });
  assert.equal(controller.receiveIncoming(staleSession), "rejected");
  assert.equal(staleSession.rejected, 1);
});

test("manual incoming call is not active until its SDK accept event", () => {
  const { controller, events } = controllerHarness();
  const incoming = new FakeCall();
  assert.equal(controller.receiveIncoming(incoming), "incoming");
  assert.equal(controller.acceptIncoming(incoming), true);
  assert.equal(incoming.accepted, 1);
  assert.equal(controller.getActiveCall(), null);
  assert.deepEqual(events.active, []);
  incoming.emit("accept");
  assert.equal(controller.getActiveCall(), incoming);
  assert.deepEqual(events.active, [incoming]);
});

test("provider errors are specific and stable repeated status is deduplicated", () => {
  assert.match(providerErrorMessage({ code: 31005, message: "transport" }), /31005.*rout/i);
  assert.doesNotMatch(providerErrorMessage({ code: 31005 }), /privacy|private/i);
  assert.match(providerErrorMessage({ code: 31208 }), /Microphone access/);
  assert.match(providerErrorMessage({ code: 31205 }), /authentication expired/);
  const first = "Phone registration failed.";
  assert.equal(dedupeStatus(first, first), first);
});

test("retention failure keeps old call and successful hold or park releases only that old agent call", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const oldCall = new FakeCall({ sid: "CA-old" });
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "provider retention failed" }), {
      status: 502, headers: { "content-type": "application/json" },
    });
    await assert.rejects(
      retainAgentCall("held", oldCall, { callerName: "A", callerNumber: "+1", duration: 12 }, {}, () => oldCall),
      /provider retention failed/,
    );
    assert.equal(oldCall.disconnected, 0);

    for (const kind of ["held", "parked"] as const) {
      const retainedCall = new FakeCall({ sid: `CA-${kind}` });
      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.duration, 12);
        assert.equal(body.callerName, "A");
        assert.equal(body.callerNumber, "+1");
        return new Response(JSON.stringify({ id: `${kind}-1` }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      };
      await retainAgentCall(kind, retainedCall, { callerName: "A", callerNumber: "+1", duration: 12 }, {}, () => retainedCall);
      assert.equal(retainedCall.disconnected, 1);
    }

    const staleOld = new FakeCall({ sid: "CA-stale" });
    const newer = new FakeCall({ sid: "CA-new" });
    globalThis.fetch = async () => new Response(JSON.stringify({ id: "held-2" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
    await retainAgentCall("held", staleOld, { callerName: "", callerNumber: "+1", duration: 1 }, {}, () => newer);
    assert.equal(staleOld.disconnected, 0);
    assert.equal(newer.disconnected, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resume request sends nonce contract and matched response can reconnect", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let body: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /held-calls\/held-7\/resume$/);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        success: true,
        reconnect: {
          id: "held-7", token: "nonce-7", expiresAt: new Date(Date.now() + 60_000).toISOString(),
          callerName: "Retained Caller", callerNumber: "+15550007",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const result = await requestReconnect("held", "held-7", "nonce-7", { Authorization: "Bearer test" });
    assert.deepEqual(body, { reconnectToken: "nonce-7" });

    const { controller } = controllerHarness();
    controller.beginReconnect("held", "held-7", "nonce-7", "", "", {
      timeoutMs: 60_000, cancel: async () => {},
    });
    assert.equal(controller.confirmReconnect(result), true);
    const incoming = new FakeCall({ retainedId: "held-7", token: "nonce-7" });
    assert.equal(controller.receiveIncoming(incoming), "recovered");
    assert.equal(incoming.accepted, 1);
    assert.equal(controller.getActiveCall(), null);
    incoming.emit("accept");
    assert.equal(controller.getActiveCall(), incoming);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("timeout cancels by exact nonce and a racing unrelated pickup is rejected", async () => {
  const { controller, events } = controllerHarness();
  const cancellations: PendingReconnect[] = [];
  controller.beginReconnect("parked", "park-9", "nonce-9", "", "+9", {
    timeoutMs: 5,
    cancel: async (pending) => { cancellations.push(pending); },
  });
  const racing = new FakeCall({ retainedId: "other-park", token: "other-nonce" });
  assert.equal(controller.receiveIncoming(racing), "rejected");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].id, "park-9");
  assert.equal(cancellations[0].token, "nonce-9");
  assert.match(events.errors.join(" "), /timed out/);
});

test("cancel response before delayed matching SDK accept rejects it without starting media", async () => {
  const { controller, events } = controllerHarness();
  const cancelled: PendingReconnect[] = [];
  controller.beginReconnect("parked", "park-race", "nonce-race", "", "+9", {
    timeoutMs: 60_000,
    cancel: async (pending) => { cancelled.push(pending); },
  });
  await controller.cancelReconnect();
  assert.equal(controller.getPendingReconnect(), null);
  const incoming = new FakeCall({ retainedId: "park-race", token: "nonce-race" });
  assert.equal(controller.receiveIncoming(incoming), "rejected");
  assert.equal(controller.getActiveCall(), null);
  assert.equal(incoming.accepted, 0);
  assert.equal(incoming.rejected, 1);
  incoming.emit("accept"); // A late provider event from the rejected leg cannot become active.
  assert.equal(controller.getActiveCall(), null);
  assert.equal(cancelled.length, 1);
  assert.deepEqual(events.active, []);
});

test("SDK answer wins after media setup begins, so a late cancel never disconnects the recovered caller", async () => {
  const { controller, events } = controllerHarness();
  let cancelRequests = 0;
  controller.beginReconnect("parked", "park-answer", "nonce-answer", "", "+9", {
    timeoutMs: 60_000,
    cancel: async () => { cancelRequests += 1; },
  });
  const incoming = new FakeCall({ retainedId: "park-answer", token: "nonce-answer" });
  controller.receiveIncoming(incoming);
  await controller.cancelReconnect();
  assert.equal(controller.getPendingReconnect()?.phase, "resuming");
  assert.equal(cancelRequests, 0);
  incoming.emit("accept");
  assert.equal(controller.getActiveCall(), incoming);
  assert.equal(controller.getPendingReconnect(), null);
  assert.equal(incoming.disconnected, 0);
  assert.deepEqual(events.active, [incoming]);
  assert.match(events.errors.join(" "), /connecting/i);
});

test("cancel-reconnect request targets suspended call with the same nonce", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requestBody: unknown;
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /suspended-calls\/park-10\/cancel-reconnect$/);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    await requestCancelReconnect({
      id: "park-10",
      token: "nonce-10",
      kind: "parked",
      sessionId: "tenant:user",
      expiresAt: Date.now() + 1000,
      phase: "resuming",
      callerName: "",
      callerNumber: "+10",
    }, {});
    assert.deepEqual(requestBody, { reconnectToken: "nonce-10" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("old cancel 409 RECONNECT_NO_LONGER_CURRENT is authoritative and clears only its pending intent", async () => {
  const { controller, events } = controllerHarness();
  controller.beginReconnect("held", "held-old", "nonce-old", "", "+1", {
    timeoutMs: 60_000,
    cancel: async () => { throw { code: "RECONNECT_NO_LONGER_CURRENT" }; },
  });
  await controller.cancelReconnect();
  assert.equal(controller.getPendingReconnect(), null);
  assert.deepEqual(events.errors, []);
});

test("a late old cancel 409 cannot clear a newer reconnect intent", async () => {
  const { controller } = controllerHarness();
  let rejectOld!: (error: unknown) => void;
  const oldCancel = new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  controller.beginReconnect("held", "held-old", "nonce-old", "", "+1", {
    timeoutMs: 60_000,
    cancel: async () => oldCancel,
  });
  const cancellation = controller.cancelReconnect();
  controller.reconcileRetainedState("held-old", undefined);
  controller.beginReconnect("parked", "park-new", "nonce-new", "", "+2", {
    timeoutMs: 60_000, cancel: async () => {},
  });
  rejectOld({ code: "RECONNECT_NO_LONGER_CURRENT" });
  await cancellation;
  assert.equal(controller.getPendingReconnect()?.id, "park-new");
  controller.endSession();
});

test("provider no-answer terminal condition cancels retained reconnect and reconciliation clears only ACTIVE ownership", async () => {
  const { controller } = controllerHarness();
  const cancelled: PendingReconnect[] = [];
  controller.beginReconnect("parked", "park-no-answer", "nonce-no-answer", "", "+1", {
    timeoutMs: 60_000,
    cancel: async (pending) => { cancelled.push(pending); },
  });
  const noAnswer = new FakeCall({ retainedId: "park-no-answer", token: "nonce-no-answer" });
  controller.receiveIncoming(noAnswer);
  noAnswer.emit("disconnect");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cancelled.length, 1);
  assert.equal(controller.getPendingReconnect(), null);

  controller.beginReconnect("parked", "park-reconcile", "nonce-reconcile", "", "+2", {
    timeoutMs: 60_000, cancel: async () => {},
  });
  assert.equal(controller.reconcileRetainedState("park-reconcile", "RESUMING", true), false);
  assert.ok(controller.getPendingReconnect());
  assert.equal(controller.reconcileRetainedState("park-reconcile", "ACTIVE", false), true);
  assert.equal(controller.getPendingReconnect(), null);
});

test("recovery disconnect followed synchronously by SDK 31208 still reports microphone denial and cancels safely", async () => {
  const { controller, events } = controllerHarness();
  const cancelled: PendingReconnect[] = [];
  controller.beginReconnect("held", "held-media", "nonce-media", "", "+1", {
    timeoutMs: 60_000,
    cancel: async (pending) => { cancelled.push(pending); },
  });
  const incoming = new FakeCall({ retainedId: "held-media", token: "nonce-media" });
  controller.receiveIncoming(incoming);
  assert.equal(controller.getActiveCall(), null);
  assert.equal(controller.getPendingReconnect()?.phase, "resuming");
  incoming.emit("disconnect");
  incoming.emit("error", { code: 31208, message: "Permission denied" });
  incoming.emit("error", { code: 31208, message: "Permission denied" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cancelled.length, 1);
  assert.equal(controller.getPendingReconnect(), null);
  assert.deepEqual(events.errors, ["Microphone access is unavailable. Allow microphone permission, then retry."]);
});

test("stale incoming error cannot end or report over a newer call", () => {
  const { controller, events } = controllerHarness();
  const stale = new FakeCall();
  controller.receiveIncoming(stale);
  controller.rejectIncoming(stale);
  const current = new FakeCall({ sid: "current" });
  controller.attachActive(current);
  stale.emit("error", { code: 31208 });
  assert.equal(controller.getActiveCall(), current);
  assert.deepEqual(events.errors, []);
  assert.deepEqual(events.ended, []);
});

test("old active call disconnect and error after a newer call cannot overwrite the new call", () => {
  const { controller, events } = controllerHarness();
  const oldCall = new FakeCall({ sid: "old" });
  const newCall = new FakeCall({ sid: "new" });
  controller.attachActive(oldCall);
  controller.attachActive(newCall);
  oldCall.emit("disconnect");
  oldCall.emit("error", { code: 31208, message: "Permission denied" });
  assert.equal(controller.getActiveCall(), newCall);
  assert.deepEqual(events.ended, []);
  assert.deepEqual(events.errors, []);
});

test("pending reconnect survives reload only in the same validated session scope", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const first = controllerHarness("tenant:user", storage, 1_000).controller;
  first.beginReconnect("parked", "park-refresh", "nonce-refresh", "Caller", "+2", {
    now: 1_000, timeoutMs: 30_000, cancel: async () => {},
  });
  assert.ok(values.has(pendingReconnectStorageKey("tenant:user")));
  first.suspendForReload();

  const restoredHarness = controllerHarness("tenant:user", storage, 2_000);
  assert.equal(restoredHarness.controller.getPendingReconnect()?.phase, "restoring");
  const incoming = new FakeCall({ retainedId: "park-refresh", token: "nonce-refresh" });
  assert.equal(restoredHarness.controller.receiveIncoming(incoming, 2_000), "recovered");
  incoming.emit("accept");
  assert.equal(values.has(pendingReconnectStorageKey("tenant:user")), false);

  values.set(pendingReconnectStorageKey("tenant:user"), JSON.stringify({
    id: "park-refresh", token: "nonce-refresh", kind: "parked", sessionId: "tenant:user",
    expiresAt: 20_000, phase: "resuming", callerName: "", callerNumber: "",
  }));
  const other = controllerHarness("other-tenant:other-user", storage, 2_000).controller;
  assert.equal(other.getPendingReconnect(), null);
  const unrelated = new FakeCall({ retainedId: "park-refresh", token: "nonce-refresh" });
  assert.equal(other.receiveIncoming(unrelated, 2_000), "rejected");
  first.startSession("other-tenant:other-user", storage, 2_000);
  assert.equal(values.has(pendingReconnectStorageKey("tenant:user")), false);
});

test("token refresh updates the live device without destroying it or its active call", () => {
  const device = {
    updated: [] as string[],
    destroyed: 0,
    updateToken(token: string) { this.updated.push(token); },
    destroy() { this.destroyed += 1; },
  };
  let token: string | null = "token-1";
  token = updateLiveDeviceToken(device, token, "token-2");
  assert.equal(token, "token-2");
  assert.deepEqual(device.updated, ["token-2"]);
  assert.equal(device.destroyed, 0);
  token = updateLiveDeviceToken(device, token, "token-2");
  assert.deepEqual(device.updated, ["token-2"]);
  assert.equal(device.destroyed, 0);
});

test("outbound coordinator fences delayed fetch and connect results after cancel", async () => {
  const coordinator = new SoftphoneOutboundCallCoordinator();
  const attempt = coordinator.begin();
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>((resolve) => { releaseFetch = resolve; });
  let connectCalls = 0;
  const setup = async () => {
    await fetchGate;
    if (!coordinator.isCurrent(attempt)) return;
    connectCalls += 1;
  };
  const pending = setup();
  coordinator.cancel();
  releaseFetch();
  await pending;
  assert.equal(connectCalls, 0);

  const connectedAttempt = coordinator.begin();
  const lateCall = new FakeCall({ sid: "late" });
  coordinator.cancel();
  assert.equal(coordinator.attachConnectedCall(connectedAttempt, lateCall), false);
  assert.equal(lateCall.disconnected, 1);
});

test("outbound coordinator tracks the pre-accept provider call so cancel disconnects it", () => {
  const { controller } = controllerHarness();
  const coordinator = new SoftphoneOutboundCallCoordinator();
  const attempt = coordinator.begin();
  const call = new FakeCall({ sid: "outbound-ringing" });
  assert.equal(coordinator.attachConnectedCall(attempt, call), true);
  controller.attachActive(call, false, undefined, false);
  assert.equal(controller.getActiveCall(), call);
  coordinator.cancel();
  assert.equal(call.disconnected, 1);
  assert.equal(controller.getActiveCall(), null);
});