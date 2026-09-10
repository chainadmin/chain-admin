export type SoftphoneKeyboardCallState = "idle" | "connecting" | "ringing" | "in-call" | "ended";

export function softphoneEnterAction({
  callState,
  hasNumber,
  busy,
  callTransitionPending,
}: {
  callState: SoftphoneKeyboardCallState;
  hasNumber: boolean;
  busy: boolean;
  callTransitionPending: boolean;
}): "call" | "hangup" | null {
  if (callTransitionPending) return null;
  if (callState === "idle") return hasNumber && !busy ? "call" : null;
  if (callState === "connecting" || callState === "ringing" || callState === "in-call") return "hangup";
  return null;
}
