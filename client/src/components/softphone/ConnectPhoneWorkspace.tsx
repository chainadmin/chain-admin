import React, { type ReactNode } from "react";
import type { ProviderCall } from "@/lib/softphone-call-lifecycle";
import {
  Building2, Check, ChevronRight, Download, EyeOff, History, LogOut, Mic, MicOff,
  Pause, Phone, PhoneCall, PhoneIncoming, PhoneOff, PhoneOutgoing, ParkingCircle,
  Radio, RotateCw, UserRound, Volume2, VolumeX, X,
} from "lucide-react";

type CallState = "idle" | "connecting" | "ringing" | "in-call" | "ended";
type Retained = { id: string; callerName: string; callerNumber: string; duration?: number | null; parkedBy?: string; status?: string; reconnectingByMe?: boolean };
type ParkedCall = { id: string; callerName: string; callerNumber: string; parkedBy: string; parkedAt: string; duration?: number | null; status?: string; reconnectingByMe?: boolean };
type CallLog = { id: string; direction: "inbound" | "outbound"; fromNumber: string; toNumber: string; status: string; duration: number | null; createdAt: string };
type WaitingCall = { id: string; call: ProviderCall; callerName: string; callerNumber: string };

interface Props {
  userName?: string;
  agentStatus: "available" | "busy" | "away";
  setAgentStatus: (value: "available" | "busy" | "away") => void;
  connectionStatus: "online" | "offline" | "reconnecting";
  isProviderRegistered: boolean;
  notice?: string;
  hasDiagnostic: boolean;
  diagnosticDetail: string;
  showRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
  pendingReconnect: { id: string; phase: string; callerName: string; callerNumber: string } | null;
  onCancelReconnect: () => void;
  inbound: { callerName: string; callerNumber: string } | null;
  onAcceptInbound: () => void;
  onRejectInbound: () => void;
  waitingCalls: WaitingCall[];
  handoffCall: ProviderCall | null;
  callTransitionPending: boolean;
  onEndAndAnswer: (call: WaitingCall) => void;
  callState: CallState;
  callDuration: string;
  dialpadNumber: string;
  setDialpadNumber: (value: string) => void;
  activeCallerName: string;
  onDial: (digit: string) => void;
  onCall: () => void;
  callPreparing: boolean;
  isMuted: boolean;
  onMute: () => void;
  isSpeakerOn: boolean;
  onSpeaker: () => void;
  isRetentionPending: boolean;
  onHold: () => void;
  onPark: () => void;
  onHangup: () => void;
  heldCall: Retained | null;
  parkedCalls: ParkedCall[];
  onResume: () => void;
  onPickup: (call: ParkedCall) => void;
  callerIdMode: "auto" | "private" | "office";
  setCallerIdMode: (mode: "auto" | "private" | "office") => void;
  privacyLineNumber: string | null;
  logs: CallLog[];
  loadingLogs: boolean;
  onLogClick: (log: CallLog) => void;
  formatRelative: (date: string) => string;
  formatDuration: (seconds: number) => string;
  statusClass: (status: string) => string;
  onLogout: () => void;
}

const keys = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]] as const;
const nameOrNumber = (row: Retained) => row.callerName || row.callerNumber || "Unknown caller";
const retainedUnavailable = (row: Retained) =>
  !!row.reconnectingByMe || ["PREPARING", "RECONCILING", "RESUMING", "CANCELING", "EXPIRING"].includes((row.status || "").toUpperCase());

function Action({ children, label, active, danger, disabled, onClick }: { children: ReactNode; label: string; active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-45 ${danger ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100" : active ? "border-teal-700 bg-teal-700 text-white" : "border-[#bfd7d0] bg-[#f9fcfb] text-[#17453f] hover:bg-[#e3f1ed]"}`}>{children}</button>;
}

export function ConnectPhoneWorkspace(props: Props) {
  const busy = props.callPreparing || props.isRetentionPending || props.callTransitionPending || !!props.pendingReconnect;
  const activeName = props.activeCallerName || props.dialpadNumber || "Enter a number";
  const phoneStatus = props.connectionStatus === "offline" ? "Offline" : props.connectionStatus === "reconnecting" || !props.isProviderRegistered ? "Connecting" : "Ready";
  return (
    <main className="min-h-[100dvh] bg-[#e6f1ed] px-3 py-3 text-[#123d38] sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#c7ded7] bg-[#f8fcfa] px-4 py-3 shadow-[0_8px_30px_rgba(12,57,49,.07)]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#087c69] text-white"><Phone size={18} /></div>
            <div className="min-w-0"><h1 className="truncate text-base font-bold tracking-tight">Chiamo Connect</h1><p className="truncate text-xs text-[#54736c]">Business calling <span className="px-1 text-[#9ab5ad]">/</span>{props.userName}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden h-2 w-2 rounded-full sm:block ${phoneStatus === "Ready" ? "bg-[#15957f]" : phoneStatus === "Offline" ? "bg-[#b64d5f]" : "bg-[#cf8a2d]"}`} />
            <select value={props.agentStatus} onChange={(e) => props.setAgentStatus(e.target.value as Props["agentStatus"])} aria-label="Agent availability" className="h-9 max-w-[112px] rounded-lg border border-[#c7ded7] bg-white px-2 text-xs font-semibold text-[#17453f] outline-none focus:ring-2 focus:ring-[#0b806d]/35"><option value="available">Available</option><option value="busy">Busy</option><option value="away">Away</option></select>
            <button type="button" onClick={props.onLogout} className="grid h-9 w-9 place-items-center rounded-lg border border-[#c7ded7] bg-white text-[#45675f] transition hover:bg-[#e3f1ed]" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </header>

        {props.hasDiagnostic && <section role="status" aria-live="polite" className="mb-3 flex items-center gap-3 rounded-xl border border-[#c3d9d2] bg-[#f4f9f7] px-3 py-2.5 text-xs text-[#315d55]">
          <Radio size={15} className="shrink-0 text-[#087c69]" /><p className="min-w-0 flex-1 leading-5">{props.diagnosticDetail}</p>
          {props.pendingReconnect && <button type="button" disabled={props.pendingReconnect.phase === "canceling"} onClick={props.onCancelReconnect} className="shrink-0 text-xs font-bold text-[#075f51] underline underline-offset-4 disabled:opacity-50">{props.pendingReconnect.phase === "canceling" ? "Restoring…" : "Cancel"}</button>}
          {props.showRetry && <button type="button" onClick={props.onRetry} disabled={props.retrying} className="flex shrink-0 items-center gap-1 font-bold text-[#075f51] underline underline-offset-4 disabled:opacity-50"><RotateCw size={13} className={props.retrying ? "animate-spin" : ""} /> Retry</button>}
        </section>}

        {props.inbound && <section className="mb-3 rounded-2xl border border-[#58a99b] bg-[#d9f1eb] p-3 shadow-[0_12px_30px_rgba(8,124,105,.12)] sm:flex sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#087c69] text-white"><PhoneIncoming size={19} /></div><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#087c69]">Secure incoming call</p><p className="truncate text-base font-bold">{props.inbound.callerName || props.inbound.callerNumber || "Unknown caller"}</p>{props.inbound.callerName && <p className="truncate font-mono text-xs text-[#52776f]">{props.inbound.callerNumber}</p>}</div></div>
          <div className="mt-3 flex gap-2 sm:mt-0 sm:w-[215px]"><Action label="Decline incoming call" disabled={props.callTransitionPending} danger onClick={props.onRejectInbound}><X size={16} />Decline</Action><Action label="Answer incoming call" disabled={props.callTransitionPending} active onClick={props.onAcceptInbound}><Check size={16} />{props.callTransitionPending ? "Answering…" : "Answer"}</Action></div>
        </section>}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl bg-[#073f3a] p-3 text-[#f4fbf8] shadow-[0_15px_40px_rgba(7,63,58,.16)] sm:p-5">
            <div className="flex items-start justify-between border-b border-white/15 pb-4"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#a9d8cc]">{props.callState === "in-call" ? "Live conversation" : props.callState === "ringing" ? "Calling" : props.callState === "connecting" ? "Opening line" : "Desk phone"}</p><h2 className="mt-1 text-lg font-bold">{props.callState === "in-call" ? props.callDuration : phoneStatus}</h2></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-[#cce7df]">{props.callerIdMode === "auto" ? "Caller ID auto" : props.callerIdMode === "private" ? "Privacy Line" : "Office caller ID"}</span></div>
            <div className="py-4 text-center"><p title={activeName} className="mx-auto max-w-full truncate font-mono text-[clamp(1.25rem,7vw,2.25rem)] font-medium tracking-[-.04em] text-white">{activeName}</p><div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#afd7cc]"><UserRound size={14} /><span className="max-w-[230px] truncate">{props.activeCallerName ? props.dialpadNumber : props.dialpadNumber ? "No customer name found" : "Name and number appear here"}</span></div></div>
              {props.callState === "idle" && <><div className="mb-2 grid grid-cols-3 gap-1.5 rounded-xl bg-white/7 p-1.5"><button type="button" onClick={() => props.setCallerIdMode("auto")} className={`rounded-lg py-2 text-xs font-semibold ${props.callerIdMode === "auto" ? "bg-white text-[#06443d]" : "text-[#bfe0d6]"}`}>Auto</button><button type="button" onClick={() => props.setCallerIdMode(props.callerIdMode === "private" ? "auto" : "private")} className={`rounded-lg py-2 text-xs font-semibold ${props.callerIdMode === "private" ? "bg-white text-[#06443d]" : "text-[#bfe0d6]"}`}><EyeOff size={13} className="mr-1 inline" />Private</button><button type="button" onClick={() => props.setCallerIdMode(props.callerIdMode === "office" ? "auto" : "office")} className={`rounded-lg py-2 text-xs font-semibold ${props.callerIdMode === "office" ? "bg-white text-[#06443d]" : "text-[#bfe0d6]"}`}><Building2 size={13} className="mr-1 inline" />Office</button></div>
              <p className={`mb-3 rounded-lg px-2.5 py-2 text-[11px] leading-4 ${props.callerIdMode === "private" && !props.privacyLineNumber ? "bg-amber-200/15 text-[#fedc8a]" : "bg-white/7 text-[#bfe0d6]"}`}>{props.callerIdMode === "private" ? props.privacyLineNumber ? <>Private shows <span className="font-mono font-bold">{props.privacyLineNumber}</span>. Callbacks go to its separate voicemail.</> : "Privacy Line setup required. A manager must assign a dedicated company number before this call can be placed." : "Private uses a dedicated company Privacy Line, not an anonymous or withheld number."}</p>
              {props.heldCall && <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#e1b65d]/45 bg-[#79550d]/35 px-3 py-2.5"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-[#fedc8a]">Held call</p><p className="truncate text-sm font-semibold">{nameOrNumber(props.heldCall)}</p></div><button type="button" disabled={!!props.pendingReconnect || retainedUnavailable(props.heldCall)} onClick={props.onResume} className="shrink-0 rounded-lg bg-[#f6c864] px-3 py-2 text-xs font-bold text-[#4c3505] disabled:opacity-50">{props.pendingReconnect?.id === props.heldCall.id ? "Reconnecting" : retainedUnavailable(props.heldCall) ? "Unavailable" : "Resume"}</button></div>}
              <input value={props.dialpadNumber} onChange={(e) => props.setDialpadNumber(e.target.value)} placeholder="Type a number" aria-label="Phone number" className="mb-3 h-12 w-full rounded-xl border border-white/15 bg-[#052f2b] px-3 text-center font-mono text-lg text-white outline-none placeholder:text-[#77a69a] focus:border-[#75cdbc]" />
              <div className="grid grid-cols-3 gap-2">{keys.map(([digit, letters]) => <button type="button" key={digit} onClick={() => props.onDial(digit)} className="h-14 rounded-xl bg-white/9 text-xl font-medium transition hover:bg-white/16 active:scale-[.97] motion-reduce:transition-none"><span className="block leading-5">{digit}</span>{letters && <span className="block text-[9px] tracking-[.17em] text-[#94c2b7]">{letters}</span>}</button>)}</div>
              <button type="button" onClick={props.onCall} disabled={!props.dialpadNumber || props.callPreparing || props.callTransitionPending} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#27a68e] text-sm font-bold text-white transition hover:bg-[#31b99e] disabled:opacity-45"><Phone size={17} />{props.callTransitionPending ? "Answering incoming call" : props.callPreparing ? "Preparing call" : "Call"}</button>
            </>}
            {(props.callState === "connecting" || props.callState === "ringing") && <div className="py-10 text-center"><PhoneOutgoing className="mx-auto mb-4 animate-pulse text-[#75cdbc]" size={34} /><p role={props.callTransitionPending ? "status" : undefined} className="text-sm text-[#b9dcd3]">{props.callTransitionPending ? "Securely connecting the selected waiting caller…" : props.callState === "ringing" ? "Ringing customer" : "Connecting to customer"}</p>{!props.callTransitionPending && <button type="button" onClick={props.onHangup} className="mt-6 rounded-xl border border-rose-300/40 bg-rose-400/10 px-6 py-3 text-sm font-bold text-rose-100">Cancel call</button>}</div>}
            {props.callState === "in-call" && <div className="space-y-3"><div className="grid grid-cols-3 gap-2"><Action label="Toggle mute" active={props.isMuted} onClick={props.onMute}>{props.isMuted ? <MicOff size={17} /> : <Mic size={17} />}<span className="hidden sm:inline">{props.isMuted ? "Muted" : "Mute"}</span></Action><Action label="Toggle speaker" active={props.isSpeakerOn} onClick={props.onSpeaker}>{props.isSpeakerOn ? <Volume2 size={17} /> : <VolumeX size={17} />}<span className="hidden sm:inline">Audio</span></Action><Action label="Place call on hold" disabled={props.isRetentionPending} onClick={props.onHold}>{props.isRetentionPending ? <RotateCw className="animate-spin" size={17} /> : <Pause size={17} />}<span className="hidden sm:inline">Hold</span></Action></div><Action label="Park call for another agent" disabled={props.isRetentionPending} onClick={props.onPark}><ParkingCircle size={17} />Park for team</Action><Action label="End active call" danger onClick={props.onHangup}><PhoneOff size={17} />End call</Action>
              <section aria-label="Call waiting" aria-live="polite" aria-atomic="false" className="rounded-xl border border-white/15 bg-white/7 p-2.5 text-left">
                <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#a9d8cc]">Call waiting</p><span className="text-[10px] text-[#94c2b7]">{props.waitingCalls.length}/4 ringing</span></div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {Array.from({ length: 4 }, (_, index) => {
                    const waiting = props.waitingCalls[index];
                    const handingOff = !!waiting && waiting.call === props.handoffCall;
                    return waiting ? <div key={waiting.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#75cdbc]/40 bg-[#0a514a] p-2">
                      <PhoneIncoming size={14} className="shrink-0 animate-pulse text-[#75cdbc]" />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{waiting.callerName || waiting.callerNumber || "Unknown caller"}</p><p className="truncate font-mono text-[10px] text-[#a9d8cc]">Ringing · {waiting.callerNumber}</p></div>
                      <button type="button" disabled={!!props.handoffCall} aria-label={`End active call and answer ${waiting.callerName || waiting.callerNumber || "unknown caller"}`} onClick={() => props.onEndAndAnswer(waiting)} className="min-h-11 shrink-0 rounded-md bg-[#75cdbc] px-2.5 py-2 text-xs font-bold text-[#073f3a] disabled:opacity-50">{handingOff ? "Answering…" : "End & answer"}</button>
                    </div> : <div key={index} className="flex min-h-12 items-center rounded-lg border border-dashed border-white/10 px-2 text-[10px] text-[#77a69a]">Line {index + 1} available</div>;
                  })}
                </div>
              </section>
            </div>}
            {props.callState === "ended" && <div className="py-10 text-center text-sm text-[#b9dcd3]"><PhoneOff className="mx-auto mb-3" size={28} />Call ended</div>}
          </section>

          <aside className="space-y-3">
            <section className="rounded-2xl border border-[#c7ded7] bg-[#f8fcfa] p-4"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><ParkingCircle size={17} className="text-[#087c69]" />Parked calls</h2><span className="rounded-full bg-[#e4f1ed] px-2 py-0.5 text-[11px] font-bold text-[#367469]">{props.parkedCalls.length}</span></div>{props.parkedCalls.length === 0 ? <p className="rounded-xl bg-[#eef6f3] px-3 py-4 text-xs leading-5 text-[#66867e]">No calls are parked. A parked caller stays available for any agent to pick up.</p> : <div className="space-y-2">{props.parkedCalls.map((call) => <div key={call.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#d5e5e0] p-2.5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{nameOrNumber(call)}</p><p className="truncate font-mono text-[11px] text-[#698981]">{call.callerNumber}</p><p className="mt-0.5 truncate text-[10px] text-[#809c95]">Parked by {call.parkedBy || "agent"}</p></div><button type="button" disabled={busy || retainedUnavailable(call)} onClick={() => props.onPickup(call)} className="shrink-0 rounded-lg bg-[#e0f1eb] px-2.5 py-2 text-xs font-bold text-[#08705e] disabled:opacity-50">{props.pendingReconnect?.id === call.id ? "Joining" : retainedUnavailable(call) ? "Unavailable" : "Pick up"}</button></div>)}</div>}</section>
            <section className="rounded-2xl border border-[#c7ded7] bg-[#f8fcfa] p-4"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><History size={17} className="text-[#087c69]" />Recent calls</h2><a href="/install" className="text-[#52776f]" aria-label="Install phone app"><Download size={16} /></a></div>{props.loadingLogs ? <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#e8f2ef]" />)}</div> : props.logs.length === 0 ? <p className="py-5 text-center text-xs text-[#698981]">Your completed and missed calls will appear here.</p> : <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">{props.logs.slice(0,20).map((log) => <button type="button" key={log.id} onClick={() => props.onLogClick(log)} className="flex w-full items-center gap-2 rounded-xl p-2 text-left transition hover:bg-[#e8f3ef]"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${log.direction === "outbound" ? "bg-[#e2efed] text-[#087c69]" : "bg-[#edf0e7] text-[#627a36]"}`}>{log.direction === "outbound" ? <PhoneOutgoing size={15} /> : <PhoneIncoming size={15} />}</span><span className="min-w-0 flex-1"><span className="block truncate font-mono text-xs font-semibold">{log.direction === "outbound" ? log.toNumber : log.fromNumber}</span><span className="block text-[10px] text-[#76928b]">{props.formatRelative(log.createdAt)}</span></span><span className="text-right">{log.duration && <span className="mb-0.5 block font-mono text-[10px] text-[#6e8b83]">{props.formatDuration(log.duration)}</span>}<span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold capitalize ${props.statusClass(log.status)}`}>{log.status}</span></span><ChevronRight size={13} className="text-[#a0b8b1]" /></button>)}</div>}</section>
          </aside>
        </div>
      </div>
    </main>
  );
}