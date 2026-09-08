import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectPhoneWorkspace } from "../../components/softphone/ConnectPhoneWorkspace";
import type { ProviderCall } from "../../lib/softphone-call-lifecycle";

const call = (sid: string): ProviderCall => ({
  parameters: { CallSid: sid },
  accept() {},
  reject() {},
  disconnect() {},
  on() {},
});

function renderWaiting(count: number, overrides: Record<string, unknown> = {}): string {
  const waitingCalls = Array.from({ length: count }, (_, index) => ({
    id: `CA-${index}`,
    call: call(`CA-${index}`),
    callerName: `Caller ${index + 1}`,
    callerNumber: `+1555000000${index}`,
  }));
  return renderToStaticMarkup(createElement(ConnectPhoneWorkspace, {
    userName: "Agent",
    agentStatus: "available",
    setAgentStatus() {},
    connectionStatus: "online",
    isProviderRegistered: true,
    hasDiagnostic: false,
    diagnosticDetail: "",
    showRetry: false,
    retrying: false,
    onRetry() {},
    pendingReconnect: null,
    onCancelReconnect() {},
    inbound: null,
    onAcceptInbound() {},
    onRejectInbound() {},
    waitingCalls,
    handoffCall: null,
    callTransitionPending: false,
    onEndAndAnswer() {},
    callState: "in-call",
    callDuration: "01:23",
    dialpadNumber: "+15551112222",
    setDialpadNumber() {},
    activeCallerName: "Active Caller",
    onDial() {},
    onCall() {},
    callPreparing: false,
    isMuted: false,
    onMute() {},
    isSpeakerOn: true,
    onSpeaker() {},
    isRetentionPending: false,
    onHold() {},
    onPark() {},
    onHangup() {},
    heldCall: null,
    parkedCalls: [],
    onResume() {},
    onPickup() {},
    callerIdMode: "auto",
    setCallerIdMode() {},
    privacyLineNumber: null,
    logs: [],
    loadingLogs: false,
    onLogClick() {},
    formatRelative: (value: string) => value,
    formatDuration: (value: number) => String(value),
    statusClass: () => "",
    onLogout() {},
    ...overrides,
  }));
}

test("active softphone renders four understandable responsive call-waiting slots", () => {
  const html = renderWaiting(0);
  assert.match(html, /aria-label="Call waiting"/);
  assert.match(html, /sm:grid-cols-2/);
  assert.equal((html.match(/Line \d available/g) || []).length, 4);
});

test("four occupied slots identify ringing callers and expose exact end-and-answer controls", () => {
  const html = renderWaiting(4);
  assert.equal((html.match(/Ringing ·/g) || []).length, 4);
  assert.equal((html.match(/End &amp; answer/g) || []).length, 4);
  assert.match(html, /answer Caller 1/);
  assert.match(html, /answer Caller 4/);
  assert.doesNotMatch(html, /Line \d available/);
});

test("pending hold or park visibly blocks end-and-answer until retention is acknowledged", () => {
  const html = renderWaiting(1, { isRetentionPending: true });
  assert.match(html, /disabled=""/);
  assert.match(html, /Securing call…/);
  assert.doesNotMatch(html, /End &amp; answer/);
});

test("a delayed waiting-call handoff cannot be falsely canceled or race outbound dialing", () => {
  const selected = call("CA-selected");
  const html = renderWaiting(0, {
    callState: "connecting",
    handoffCall: selected,
    callTransitionPending: true,
  });
  assert.match(html, /Securely connecting the selected waiting caller/);
  assert.doesNotMatch(html, /Cancel call/);
});