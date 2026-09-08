export type RetainedCallKind = "held" | "parked";
export type ReconnectPhase = "preparing" | "resuming" | "restoring" | "canceling";

export interface ReconnectMetadata {
  id: string;
  token: string;
  expiresAt: string;
  callerName: string;
  callerNumber: string;
}

export interface PendingReconnect {
  id: string;
  token: string;
  kind: RetainedCallKind;
  sessionId: string;
  expiresAt: number;
  phase: ReconnectPhase;
  callerName: string;
  callerNumber: string;
  cancelRequested?: boolean;
}

export interface ReconnectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProviderCall {
  parameters: Record<string, string | undefined>;
  customParameters?: Map<string, string>;
  accept(): void;
  reject(): void;
  disconnect(): void;
  on(event: string, listener: (...args: any[]) => void): void;
}

export interface LifecycleCallbacks {
  onActive(call: ProviderCall, recovered: boolean, metadata?: PendingReconnect): void;
  onEnded(call: ProviderCall): void;
  onIncoming(call: ProviderCall): void;
  onIncomingCleared(call: ProviderCall): void;
  onReconnectChanged(pending: PendingReconnect | null): void;
  onError(message: string): void;
}

const NOOP_CALLBACKS: LifecycleCallbacks = {
  onActive: () => {},
  onEnded: () => {},
  onIncoming: () => {},
  onIncomingCleared: () => {},
  onReconnectChanged: () => {},
  onError: () => {},
};
const MAX_PERSISTED_RECONNECT_MS = 60_000;

export function pendingReconnectStorageKey(sessionId: string): string {
  return `softphone:${sessionId}:pending-reconnect`;
}

export class SoftphoneCallController {
  private callbacks: LifecycleCallbacks = NOOP_CALLBACKS;
  private sessionId = "";
  private storage: ReconnectStorage | null = null;
  private activeCall: ProviderCall | null = null;
  private incomingCall: ProviderCall | null = null;
  private acceptingCall: ProviderCall | null = null;
  private acceptingRecovery: PendingReconnect | null = null;
  private recentTerminal: { call: ProviderCall; recovery: boolean; sessionId: string } | null = null;
  private pending: PendingReconnect | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private cancelPendingRequest?: (pending: PendingReconnect) => Promise<void>;
  private boundCalls = new WeakSet<object>();

  configure(callbacks: LifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  setReconnectCanceller(cancel: (pending: PendingReconnect) => Promise<void>): void {
    this.cancelPendingRequest = cancel;
  }

  startSession(sessionId: string, storage?: ReconnectStorage, now = Date.now()): void {
    if (sessionId === this.sessionId) {
      if (storage) this.storage = storage;
      return;
    }
    if (this.sessionId && this.sessionId !== "signed-out") {
      this.storage?.removeItem(pendingReconnectStorageKey(this.sessionId));
    }
    this.clearPending(false);
    this.sessionId = sessionId;
    this.storage = storage ?? null;
    this.activeCall = null;
    this.incomingCall = null;
    this.acceptingCall = null;
    this.acceptingRecovery = null;
    if (!storage || sessionId === "signed-out") return;

    const restored = this.readPersisted(storage, sessionId, now);
    if (!restored) return;
    this.pending = { ...restored, phase: "restoring" };
    this.callbacks.onReconnectChanged(this.pending);
    this.scheduleTimeout(this.pending.expiresAt - now);
    if (restored.cancelRequested) void this.performCancel();
  }

  getActiveCall(): ProviderCall | null {
    return this.activeCall;
  }

  getPendingReconnect(): PendingReconnect | null {
    return this.pending;
  }

  reconcileRetainedState(id: string, status: string | null | undefined, reconnectingByMe = false): boolean {
    const pending = this.pending;
    if (!pending || pending.id !== id) return false;
    const normalized = (status || "").toUpperCase();
    if (!normalized || normalized === "COMPLETED" || normalized === "EXPIRED" ||
        (normalized === "ACTIVE" && !reconnectingByMe)) {
      this.clearPending(true);
      return true;
    }
    return false;
  }

  resumePendingTimeout(now = Date.now()): void {
    if (this.pending) this.scheduleTimeout(this.pending.expiresAt - now);
  }

  /** Stops this page instance without deleting reload-recoverable session intent. */
  suspendForReload(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  isIncoming(call: ProviderCall): boolean {
    return this.incomingCall === call;
  }

  attachActive(call: ProviderCall, _recovered = false, _metadata?: PendingReconnect, notify = true): void {
    this.bindCallEvents(call);
    this.activeCall = call;
    if (notify) this.callbacks.onActive(call, false);
  }

  /** Kept for SDK adapters that report acceptance directly; normal calls use the accept event. */
  markAccepted(call: ProviderCall): void {
    this.handleAccepted(call);
  }

  failCall(call: ProviderCall, message: string): void {
    this.handleCallError(call, { message });
  }

  receiveIncoming(call: ProviderCall, now = Date.now()): "recovered" | "incoming" | "rejected" {
    const retainedId = call.customParameters?.get("RetainedCallId");
    const reconnectToken = call.customParameters?.get("ReconnectToken");
    if (retainedId || reconnectToken) {
      const pending = this.pending;
      const matched = !!pending &&
        pending.sessionId === this.sessionId &&
        pending.id === retainedId &&
        pending.token === reconnectToken &&
        pending.expiresAt > now &&
        !pending.cancelRequested &&
        !this.activeCall &&
        !this.acceptingCall &&
        !this.incomingCall;
      if (!matched) {
        this.safeReject(call);
        return "rejected";
      }
      this.bindCallEvents(call);
      this.acceptingCall = call;
      this.acceptingRecovery = pending;
      this.updatePending({ ...pending, phase: "resuming" });
      try {
        call.accept();
      } catch (error) {
        this.handleCallError(call, error);
        return "rejected";
      }
      // accept() only starts media setup. Recovery is not complete until "accept".
      return "recovered";
    }

    if (this.activeCall || this.acceptingCall || this.incomingCall) {
      this.safeReject(call);
      return "rejected";
    }
    this.bindCallEvents(call);
    this.incomingCall = call;
    this.callbacks.onIncoming(call);
    return "incoming";
  }

  acceptIncoming(call: ProviderCall): boolean {
    if (this.incomingCall !== call || this.activeCall || this.acceptingCall) return false;
    this.acceptingCall = call;
    try {
      call.accept();
      return true;
    } catch (error) {
      this.handleCallError(call, error);
      return false;
    }
  }

  rejectIncoming(call: ProviderCall): boolean {
    if (this.incomingCall !== call) return false;
    this.safeReject(call);
    this.incomingCall = null;
    this.callbacks.onIncomingCleared(call);
    return true;
  }

  beginReconnect(
    kind: RetainedCallKind,
    id: string,
    token: string,
    callerName: string,
    callerNumber: string,
    options: { now?: number; timeoutMs?: number; cancel: (pending: PendingReconnect) => Promise<void> },
  ): PendingReconnect | null {
    if (this.pending || this.activeCall || this.acceptingCall) return null;
    const timeoutMs = Math.min(options.timeoutMs ?? 30_000, MAX_PERSISTED_RECONNECT_MS);
    const pending: PendingReconnect = {
      kind,
      id,
      token,
      callerName,
      callerNumber,
      sessionId: this.sessionId,
      expiresAt: (options.now ?? Date.now()) + timeoutMs,
      phase: "preparing",
    };
    this.cancelPendingRequest = options.cancel;
    this.updatePending(pending);
    this.scheduleTimeout(timeoutMs);
    return pending;
  }

  confirmReconnect(metadata: ReconnectMetadata): boolean {
    if (!this.pending) return false;
    if (metadata.id !== this.pending.id || metadata.token !== this.pending.token) {
      void this.cancelReconnect("The reconnect response did not match this request.");
      return false;
    }
    const expiresAt = Math.min(Date.parse(metadata.expiresAt), Date.now() + MAX_PERSISTED_RECONNECT_MS);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      void this.cancelReconnect("The reconnect request expired. The caller remains retained.");
      return false;
    }
    this.updatePending({
      ...this.pending,
      phase: "resuming",
      expiresAt,
      callerName: metadata.callerName || this.pending.callerName,
      callerNumber: metadata.callerNumber || this.pending.callerNumber,
    });
    this.scheduleTimeout(expiresAt - Date.now());
    return true;
  }

  failReconnect(message: string): void {
    this.clearPending(true);
    this.callbacks.onError(message);
  }

  async cancelReconnect(message?: string): Promise<void> {
    if (!this.pending || this.pending.phase === "canceling") return;
    // Once the matched leg has begun media setup, provider answer wins. Do not
    // race a cancel request against an answer and risk dropping the caller.
    if (this.acceptingCall && this.acceptingRecovery) {
      this.callbacks.onError("The retained call is connecting. Please wait for it to finish connecting.");
      return;
    }
    await this.performCancel(message);
  }

  private async performCancel(message?: string): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const cancel = this.cancelPendingRequest;
    this.updatePending({ ...pending, phase: "canceling", cancelRequested: true });
    if (cancel) {
      try {
        await cancel(this.pending!);
      } catch (error) {
        const code = (error as { code?: string } | undefined)?.code;
        const current = this.pending;
        const isSamePending = current?.id === pending.id && current.token === pending.token;
        if (!isSamePending) return;
        if (code === "RECONNECT_NO_LONGER_CURRENT" && isSamePending) {
          this.clearPending(true);
          return;
        }
        this.updatePending({ ...current!, phase: "restoring", cancelRequested: true });
        this.scheduleTimeout(Math.max(1_000, Math.min(10_000, pending.expiresAt - Date.now())));
        this.callbacks.onError("Reconnect cancellation could not be confirmed. The retained-call list will refresh.");
        return;
      }
    }
    // Backend cancellation may wait for its finite Dial action before restoring hold music.
    if (this.pending?.id === pending.id && this.pending.token === pending.token) {
      this.clearPending(true);
      if (message) this.callbacks.onError(message);
    }
  }

  endSession(): void {
    const pending = this.pending;
    const cancel = this.cancelPendingRequest;
    if (pending && cancel) void cancel(pending).catch(() => {});
    if (this.sessionId) this.storage?.removeItem(pendingReconnectStorageKey(this.sessionId));
    this.clearPending(true);
    this.sessionId = "";
    this.activeCall = null;
    this.incomingCall = null;
    this.acceptingCall = null;
    this.acceptingRecovery = null;
  }

  private bindCallEvents(call: ProviderCall): void {
    if (this.boundCalls.has(call as object)) return;
    this.boundCalls.add(call as object);
    call.on("accept", () => this.handleAccepted(call));
    call.on("error", (error: unknown) => this.handleCallError(call, error));
    call.on("cancel", () => this.handleTerminal(call));
    call.on("disconnect", () => this.handleTerminal(call));
  }

  private handleAccepted(call: ProviderCall): void {
    if (this.activeCall === call) {
      this.callbacks.onActive(call, false);
      return;
    }
    if (this.acceptingCall !== call) return;
    const recovery = this.acceptingRecovery;
    this.acceptingCall = null;
    this.acceptingRecovery = null;
    this.recentTerminal = null;
    if (this.incomingCall === call) {
      this.incomingCall = null;
      this.callbacks.onIncomingCleared(call);
    }
    this.activeCall = call;
    if (recovery) this.clearPending(true);
    this.callbacks.onActive(call, !!recovery, recovery ?? undefined);
  }

  private handleCallError(call: ProviderCall, error: unknown): void {
    const terminal = this.recentTerminal;
    const terminalRelevant = terminal?.call === call &&
      terminal.sessionId === this.sessionId &&
      !this.activeCall;
    const relevant = this.activeCall === call || this.incomingCall === call || this.acceptingCall === call || terminalRelevant;
    if (!relevant) return; // An old incoming call cannot disturb a newer call.
    const wasActive = this.activeCall === call;
    const wasRecovery = (this.acceptingCall === call && !!this.acceptingRecovery) || !!terminal?.recovery;
    if (this.incomingCall === call) {
      this.incomingCall = null;
      this.callbacks.onIncomingCleared(call);
    }
    if (this.acceptingCall === call) {
      this.acceptingCall = null;
      this.acceptingRecovery = null;
    }
    if (wasActive) {
      this.activeCall = null;
      this.callbacks.onEnded(call);
    }
    if (terminalRelevant) this.recentTerminal = null;
    this.safeReject(call);
    this.callbacks.onError(providerErrorMessage(error, "call"));
    if (wasRecovery) void this.cancelReconnect();
  }

  private handleTerminal(call: ProviderCall): void {
    const wasRecovery = this.acceptingCall === call && !!this.acceptingRecovery;
    const wasRelevant = this.activeCall === call || this.incomingCall === call || this.acceptingCall === call;
    if (this.incomingCall === call) {
      this.incomingCall = null;
      this.callbacks.onIncomingCleared(call);
    }
    if (this.acceptingCall === call) {
      this.acceptingCall = null;
      this.acceptingRecovery = null;
    }
    if (this.activeCall === call) {
      this.activeCall = null;
      this.callbacks.onEnded(call);
    }
    if (!wasRelevant) return;
    this.recentTerminal = { call, recovery: wasRecovery, sessionId: this.sessionId };
    queueMicrotask(() => {
      if (this.recentTerminal?.call !== call) return;
      const recovery = this.recentTerminal.recovery;
      this.recentTerminal = null;
      if (recovery) void this.cancelReconnect();
    });
  }

  private safeReject(call: ProviderCall): void {
    try { call.reject(); } catch {}
  }

  private scheduleTimeout(timeoutMs: number): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(
      () => void this.cancelReconnect("Reconnect timed out. The caller remains retained."),
      Math.max(0, timeoutMs),
    );
  }

  private updatePending(pending: PendingReconnect): void {
    this.pending = pending;
    this.persistPending();
    this.callbacks.onReconnectChanged(pending);
  }

  private clearPending(notify: boolean): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    if (this.sessionId) this.storage?.removeItem(pendingReconnectStorageKey(this.sessionId));
    this.pending = null;
    if (notify) this.callbacks.onReconnectChanged(null);
  }

  private persistPending(): void {
    if (!this.pending || !this.storage || !this.sessionId || this.sessionId === "signed-out") return;
    this.storage.setItem(pendingReconnectStorageKey(this.sessionId), JSON.stringify(this.pending));
  }

  private readPersisted(storage: ReconnectStorage, sessionId: string, now: number): PendingReconnect | null {
    const key = pendingReconnectStorageKey(sessionId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingReconnect;
      const valid = value &&
        value.sessionId === sessionId &&
        (value.kind === "held" || value.kind === "parked") &&
        typeof value.id === "string" && !!value.id &&
        typeof value.token === "string" && !!value.token &&
        typeof value.expiresAt === "number" &&
        value.expiresAt > now &&
        value.expiresAt <= now + MAX_PERSISTED_RECONNECT_MS;
      if (valid) return value;
    } catch {}
    storage.removeItem(key);
    return null;
  }
}

export function providerErrorMessage(error: unknown, context: "registration" | "call" = "call"): string {
  const value = error as { code?: number; message?: string };
  const code = Number(value?.code);
  const detail = typeof value?.message === "string" ? value.message : "";
  if (code === 31005) {
    return "Phone provider error 31005: the call could not be routed. Check the provider application and voice routing configuration.";
  }
  if ([31208, 31401].includes(code) || /microphone|media|permission|notallowed/i.test(detail)) {
    return "Microphone access is unavailable. Allow microphone permission, then retry.";
  }
  if ([20101, 31204, 31205].includes(code) || /token|authentication|unauthor/i.test(detail)) {
    return "Phone authentication expired. Refresh phone registration.";
  }
  if (context === "registration") return detail || "Phone provider registration failed.";
  return detail || "The call could not be completed.";
}

export function dedupeStatus(previous: string, next: string): string {
  return previous === next ? previous : next;
}