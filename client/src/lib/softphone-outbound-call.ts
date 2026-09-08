export interface AbortableAttempt {
  id: number;
  signal: AbortSignal;
}

export interface DisconnectableCall {
  disconnect(): void;
}

/** Fences asynchronous call setup so a cancelled attempt can never attach late. */
export class SoftphoneOutboundCallCoordinator {
  private sequence = 0;
  private current: { attempt: AbortableAttempt; controller: AbortController; cancelled: boolean; call: DisconnectableCall | null } | null = null;

  begin(): AbortableAttempt {
    this.cancel();
    const controller = new AbortController();
    const attempt = { id: ++this.sequence, signal: controller.signal };
    this.current = { attempt, controller, cancelled: false, call: null };
    return attempt;
  }

  isCurrent(attempt: AbortableAttempt): boolean {
    return this.current?.attempt === attempt && !this.current.cancelled;
  }

  attachConnectedCall(attempt: AbortableAttempt, call: DisconnectableCall): boolean {
    if (!this.isCurrent(attempt)) {
      call.disconnect();
      return false;
    }
    this.current!.call = call;
    return true;
  }

  getCall(): DisconnectableCall | null {
    return this.current?.call ?? null;
  }

  cancel(): boolean {
    const current = this.current;
    if (!current || current.cancelled) return false;
    current.cancelled = true;
    current.controller.abort();
    if (current.call) current.call.disconnect();
    this.current = null;
    return true;
  }

  complete(attempt: AbortableAttempt): void {
    if (this.current?.attempt === attempt) this.current = null;
  }

  completeCall(call: DisconnectableCall): void {
    if (this.current?.call === call) this.current = null;
  }
}