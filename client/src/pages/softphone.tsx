import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Loader2, Phone, PhoneCall, PhoneOff, PhoneOutgoing, PhoneIncoming, Mic, MicOff, Volume2, VolumeX, History, LogOut, EyeOff, Building2, Download, Pause, ParkingCircle, UserRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Device, Call } from "@twilio/voice-sdk";
import { detectBrand } from "@/config/brands";
import { isChiamoConnectPhoneShell } from "@/lib/app-detection";
import { ChiamoLogin } from "@/chiamo/chiamo-login";
import { deleteCookie, getAuthToken, setCookie } from "@/lib/cookies";
import {
  cacheVerifiedSoftphoneUser,
  clearLegacySoftphoneCache,
  isMatchingVoipSession,
  requestSoftphoneLogin,
  requestVoipSession,
  safeResponseJson,
  softphoneApiUrl,
  softphoneScope,
  type SoftphoneUser,
  type VoipSession,
} from "@/lib/softphone-session";
import {
  SoftphoneCallController,
  dedupeStatus,
  providerErrorMessage,
  type PendingReconnect,
  type ProviderCall,
} from "@/lib/softphone-call-lifecycle";
import { cancelReconnect, requestReconnect, retainAgentCall } from "@/lib/softphone-call-requests";
import { updateLiveDeviceToken } from "@/lib/softphone-call-device";
import { ConnectPhoneWorkspace } from "@/components/softphone/ConnectPhoneWorkspace";

interface VoipCallLog {
  id: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  status: string;
  duration: number | null;
  recordingUrl: string | null;
  notes: string | null;
  createdAt: string;
}

interface CallerLookup {
  found: boolean;
  consumer?: { firstName?: string; lastName?: string; phone?: string; email?: string };
}

interface ParkedCall {
  id: string;
  callerName: string;
  callerNumber: string;
  parkedBy: string;
  parkedAt: string;
  duration?: number | null;
  status?: string;
  reconnectingByMe?: boolean;
}

interface HeldCall {
  id: string;
  callerName: string;
  callerNumber: string;
  heldAt: string;
  duration?: number | null;
  status?: string;
  reconnectingByMe?: boolean;
}

const dialpadButtons = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

export default function SoftphonePage() {
  const product = detectBrand();
  // Presentation remains independent from the actual product used for authentication.
  const connectShell = isChiamoConnectPhoneShell();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [user, setUser] = useState<SoftphoneUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [isProviderRegistered, setIsProviderRegistered] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"online" | "offline" | "reconnecting">(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );
  const [inlineStatus, setInlineStatus] = useState("");
  const [listError, setListError] = useState("");
  const [pendingReconnect, setPendingReconnect] = useState<PendingReconnect | null>(null);
  const [isRetentionPending, setIsRetentionPending] = useState(false);
  const [isDialPreparing, setIsDialPreparing] = useState(false);

  const [dialpadNumber, setDialpadNumber] = useState("");
  const [callState, setCallState] = useState<"idle" | "connecting" | "ringing" | "in-call" | "ended">("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [agentStatus, setAgentStatus] = useState<"available" | "busy" | "away">("available");
  const [callerIdMode, setCallerIdMode] = useState<"auto" | "private" | "office">("auto");
  const [isOnHold, setIsOnHold] = useState(false);
  const [parkedCalls, setParkedCalls] = useState<ParkedCall[]>([]);
  const [heldCall, setHeldCall] = useState<HeldCall | null>(null);
  const [activeCallerName, setActiveCallerName] = useState("");

  const [inboundCall, setInboundCall] = useState<Call | null>(null);
  const [inboundCallerNumber, setInboundCallerNumber] = useState<string>("");
  const [inboundCallerName, setInboundCallerName] = useState<string>("");

  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const deviceTokenRef = useRef<string | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const lifecycleRef = useRef(new SoftphoneCallController());
  const retentionLockRef = useRef(false);
  const dialLockRef = useRef(false);

  const setStableStatus = (message: string) => setInlineStatus((previous) => dedupeStatus(previous, message));

  lifecycleRef.current.configure({
    onActive: (call, recovered, metadata) => {
      activeCallRef.current = call as Call;
      setInboundCall(null);
      setInboundCallerNumber("");
      setInboundCallerName("");
      if (metadata) {
        setDialpadNumber(metadata.callerNumber);
        setActiveCallerName(metadata.callerName);
        if (metadata.kind === "held") setHeldCall(null);
        else void refreshParkedCalls();
      }
      setIsOnHold(false);
      setCallState("in-call");
      if (recovered) setStableStatus("Retained call reconnected.");
    },
    onEnded: (call) => {
      if (activeCallRef.current === call) activeCallRef.current = null;
      setCallState("ended");
      setTimeout(() => {
        if (lifecycleRef.current.getActiveCall()) return;
        setCallState("idle");
        setDialpadNumber("");
        setIsMuted(false);
        setIsOnHold(false);
        setActiveCallerName("");
      }, 2000);
      queryClient.invalidateQueries({ queryKey: callLogsQueryKey });
    },
    onIncoming: (call) => {
      const providerCall = call as Call;
      const callerNumber = providerCall.parameters.From || "Unknown";
      setInboundCallerNumber(callerNumber);
      setInboundCall(providerCall);
      setInboundCallerName("");
      void lookupCallerName(callerNumber).then((name) => {
        if (lifecycleRef.current.isIncoming(providerCall as unknown as ProviderCall)) setInboundCallerName(name);
      });
    },
    onIncomingCleared: (call) => {
      setInboundCall((current) => current === call ? null : current);
      setInboundCallerNumber("");
      setInboundCallerName("");
    },
    onReconnectChanged: setPendingReconnect,
    onError: setStableStatus,
  });

  useEffect(() => {
    let active = true;
    const restore = async () => {
      clearLegacySoftphoneCache(localStorage);
      const token = getAuthToken();
      if (!token) {
        if (active) setIsRestoringSession(false);
        return;
      }
      try {
        const session = await requestVoipSession(token);
        if (!isMatchingVoipSession(session, product)) {
          return;
        }
        if (!session.callingAllowed) {
          if (active) setSessionError("This account is signed in but does not have calling access. Contact your administrator.");
          return;
        }
        cacheVerifiedSoftphoneUser(localStorage, session);
        if (!active) return;
        setAuthToken(token);
        setUser(session.user);
        setIsAuthenticated(true);
      } catch {
        // Expired and password-change-only tokens return to the normal login flow.
        // A cached token or user is never enough to create a phone session.
      } finally {
        if (active) setIsRestoringSession(false);
      }
    };
    void restore();

    return () => {
      active = false;
    };
  }, [product]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const data = await requestSoftphoneLogin(username, password, product);
      if (data.requiresPasswordChange) {
        if (product === "chiamo") {
          setLoginError("");
          setIsRestoringSession(false);
        } else {
          setLoginError("This product does not support temporary-password recovery on the softphone. Use your company sign-in page.");
        }
        return;
      }
      const session: VoipSession = await requestVoipSession(data.token);
      if (!isMatchingVoipSession(session, product)) {
        setLoginError("This account belongs to a different product. Use the correct sign-in page.");
        return;
      }
      if (!session.callingAllowed) {
        setLoginError(connectShell ? "You don't have calling access. Please contact your administrator." : "You don't have VoIP access. Please contact your administrator.");
        return;
      }
      clearLegacySoftphoneCache(localStorage);
      cacheVerifiedSoftphoneUser(localStorage, session);
      localStorage.setItem("authToken", data.token);
      setCookie("authToken", data.token);
      setAuthToken(data.token);
      setUser(session.user);
      setIsAuthenticated(true);
    } catch (error) {
      setLoginError("Connection error. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    lifecycleRef.current.endSession();
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
      deviceTokenRef.current = null;
    }
    clearLegacySoftphoneCache(localStorage);
    if (user) localStorage.removeItem(`softphone:${softphoneScope(product, user)}:user`);
    localStorage.removeItem("authToken");
    deleteCookie("authToken");
    queryClient.removeQueries({ queryKey: callLogsQueryKey });
    queryClient.removeQueries({ queryKey: voiceTokenQueryKey });
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
    setUsername("");
    setPassword("");
    setProviderError("");
    setInlineStatus("");
    setPendingReconnect(null);
    setIsProviderRegistered(false);
  };

  const getAuthHeaders = (): Record<string, string> => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  const lookupCallerName = async (phone: string) => {
    if (!phone || phone === "Unknown") return "";
    try {
      const response = await fetch(softphoneApiUrl(`/api/consumers/lookup-by-phone?phone=${encodeURIComponent(phone)}`), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) return "";
      const data: CallerLookup = await response.json();
      if (!data.found || !data.consumer) return "";
      return [data.consumer.firstName, data.consumer.lastName].filter(Boolean).join(" ").trim();
    } catch (error) {
      return "";
    }
  };

  const refreshParkedCalls = async () => {
    try {
      const response = await fetch(softphoneApiUrl("/api/voip/parked-calls"), { headers: getAuthHeaders(), credentials: "include" });
      if (!response.ok) throw new Error("Parked calls could not be refreshed.");
      const rows = await response.json() as ParkedCall[];
      const reconnecting = lifecycleRef.current.getPendingReconnect();
      setParkedCalls((current) => {
        if (reconnecting?.kind !== "parked" || rows.some((row) => row.id === reconnecting.id)) return rows;
        const retained = current.find((row) => row.id === reconnecting.id);
        return retained ? [retained, ...rows] : rows;
      });
      setListError("");
    } catch {
      setListError("Retained-call lists could not be refreshed. Existing entries remain shown.");
    }
  };

  const refreshHeldCall = async () => {
    try {
      const response = await fetch(softphoneApiUrl("/api/voip/held-calls"), { headers: getAuthHeaders(), credentials: "include" });
      if (!response.ok) throw new Error("Held call could not be refreshed.");
      const value = await response.json() as HeldCall | null;
      if (value || lifecycleRef.current.getPendingReconnect()?.kind !== "held") setHeldCall(value);
      setListError("");
    } catch {
      setListError("Retained-call lists could not be refreshed. Existing entries remain shown.");
    }
  };

  const handleAuthError = () => {
    clearLegacySoftphoneCache(localStorage);
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
    lifecycleRef.current.endSession();
    setSessionError("Your session expired. Please sign in again.");
  };

  const sessionScope = user ? softphoneScope(product, user) : "signed-out";
  const callLogsQueryKey = ["/api/voip/call-logs", sessionScope] as const;
  const voiceTokenQueryKey = ["/api/voip/token", sessionScope] as const;
  const { data: callLogs = [], isLoading: loadingLogs } = useQuery<VoipCallLog[]>({
    queryKey: callLogsQueryKey,
    enabled: isAuthenticated,
    retry: 1,
    queryFn: async () => {
      const response = await fetch(softphoneApiUrl("/api/voip/call-logs"), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) throw new Error("Failed to fetch call logs");
      return response.json();
    },
  });

  const { data: voiceToken, error: voiceTokenError, refetch: retryVoiceToken, isFetching: isFetchingVoiceToken } = useQuery<{ token: string; identity: string }>({
    queryKey: voiceTokenQueryKey,
    enabled: isAuthenticated,
    retry: false,
    refetchInterval: 1000 * 60 * 55,
    queryFn: async () => {
      const response = await fetch(softphoneApiUrl("/api/voip/token"), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (response.status === 401) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) {
        const data = await safeResponseJson(response);
        throw new Error(data && typeof data.message === "string" ? data.message : "Phone provider registration is unavailable.");
      }
      return response.json();
    },
  });

  useEffect(() => {
    const controller = lifecycleRef.current;
    const headers = getAuthHeaders();
    controller.setReconnectCanceller((pending) => cancelReconnect(pending, headers));
    controller.startSession(
      sessionScope,
      isAuthenticated ? sessionStorage : undefined,
    );
  }, [isAuthenticated, sessionScope, authToken]);

  useEffect(() => {
    const controller = lifecycleRef.current;
    controller.resumePendingTimeout();
    return () => controller.suspendForReload();
  }, [sessionScope]);

  useEffect(() => {
    const offline = () => {
      setConnectionStatus("offline");
      setIsProviderRegistered(false);
    };
    const online = () => {
      setConnectionStatus("reconnecting");
      if (deviceRef.current) {
        deviceRef.current.register()
          .catch((error: unknown) => setProviderError(providerErrorMessage(error, "registration")));
      } else {
        void retryVoiceToken();
      }
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [retryVoiceToken]);

  // Device lifetime is scoped to the authenticated identity, not the rotating token.
  useEffect(() => {
    if (!voiceToken?.token) return;

    setProviderError("");
    setIsProviderRegistered(false);
    const device = new Device(voiceToken.token, {
      logLevel: 1,
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    device.on("registered", () => {
      if (deviceRef.current !== device) return;
      setProviderError("");
      setIsProviderRegistered(true);
      setConnectionStatus("online");
    });

    device.on("unregistered", () => {
      if (deviceRef.current !== device) return;
      setIsProviderRegistered(false);
      if (navigator.onLine) setConnectionStatus("reconnecting");
    });

    device.on("error", (error) => {
      if (deviceRef.current !== device) return;
      setProviderError(providerErrorMessage(error, "registration"));
      setIsProviderRegistered(false);
    });

    device.on("incoming", (call: Call) => {
      if (deviceRef.current !== device) {
        call.reject();
        return;
      }
      lifecycleRef.current.receiveIncoming(call as unknown as ProviderCall);
    });

    deviceRef.current = device;
    deviceTokenRef.current = voiceToken.token;
    device.register().catch((error: Error) => {
      if (deviceRef.current !== device) return;
      setProviderError(providerErrorMessage(error, "registration"));
      setIsProviderRegistered(false);
    });

    return () => {
      if (deviceRef.current === device) {
        device.destroy();
        deviceRef.current = null;
        deviceTokenRef.current = null;
      }
    };
  }, [voiceToken?.identity, sessionScope]);

  // Token rotation updates the live Device in place and must never tear down an active call.
  useEffect(() => {
    if (!voiceToken?.token || !deviceRef.current) return;
    try {
      deviceTokenRef.current = updateLiveDeviceToken(
        deviceRef.current,
        deviceTokenRef.current,
        voiceToken.token,
      );
    } catch (error) {
      setProviderError(providerErrorMessage(error, "registration"));
      setIsProviderRegistered(false);
    }
  }, [voiceToken?.token, sessionScope]);

  useEffect(() => {
    if (activeCallRef.current) {
      activeCallRef.current.mute(isMuted);
    }
  }, [isMuted]);

  const handleAcceptInbound = () => {
    if (!inboundCall) return;
    if (!lifecycleRef.current.acceptIncoming(inboundCall as unknown as ProviderCall)) return;
    setDialpadNumber(inboundCallerNumber);
    setActiveCallerName(inboundCallerName);
  };

  const handleRejectInbound = () => {
    if (!inboundCall) return;
    lifecycleRef.current.rejectIncoming(inboundCall as unknown as ProviderCall);
  };

  const initiateCallMutation = useMutation({
    mutationFn: async (toNumber: string) => {
      if (!deviceRef.current) {
        throw new Error("Phone device not initialized. Please wait a moment and try again.");
      }

      const response = await fetch(softphoneApiUrl("/api/voip/call"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ toNumber, callerIdMode }),
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) {
        const data = await safeResponseJson(response);
        throw new Error(data && typeof data.message === "string" ? data.message : "Failed to initiate call");
      }
      const callInfo: { actualFromNumber: string; toNumber: string; isPrivate: boolean; selectionToken: string } = await response.json();

      const connectParams: Record<string, string> = {
        To: callInfo.toNumber,
        SelectionToken: callInfo.selectionToken,
      };
      if (!callInfo.isPrivate && callInfo.actualFromNumber) {
        connectParams.From = callInfo.actualFromNumber;
      }

      const call = await deviceRef.current.connect({ params: connectParams });

      lifecycleRef.current.attachActive(call as unknown as ProviderCall, false, undefined, false);

      call.on("ringing", () => {
        if (lifecycleRef.current.getActiveCall() === call) setCallState("ringing");
      });

      return call;
    },
    onMutate: () => {
      setInlineStatus("");
      setCallState("connecting");
    },
    onError: (error: Error) => {
      setCallState("idle");
      setStableStatus(providerErrorMessage(error, "call"));
    },
    onSettled: () => {
      dialLockRef.current = false;
      setIsDialPreparing(false);
    },
  });

  useEffect(() => {
    if (callState === "in-call") {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      if (callState === "idle") {
        setCallDuration(0);
      }
    }
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDialpadPress = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
    if (callState === "in-call" && activeCallRef.current) {
      activeCallRef.current.sendDigits(digit);
    }
  };

  const handleCall = async () => {
    if (!dialpadNumber || dialLockRef.current || initiateCallMutation.isPending || lifecycleRef.current.getActiveCall()) return;
    dialLockRef.current = true;
    setIsDialPreparing(true);
    try {
      setActiveCallerName(await lookupCallerName(dialpadNumber));
      setIsOnHold(false);
      initiateCallMutation.mutate(dialpadNumber);
    } catch {
      dialLockRef.current = false;
      setIsDialPreparing(false);
    }
  };

  const handleToggleHold = async () => {
    const oldAgentCall = activeCallRef.current;
    const activeCallSid = oldAgentCall?.parameters.CallSid;
    if (!oldAgentCall || !activeCallSid || retentionLockRef.current) return;
    retentionLockRef.current = true;
    setIsRetentionPending(true);
    setInlineStatus("");
    try {
      const retained = await retainAgentCall<HeldCall>(
        "held",
        oldAgentCall,
        { callerName: activeCallerName, callerNumber: dialpadNumber, duration: callDuration },
        getAuthHeaders(),
        () => activeCallRef.current,
      );
      setHeldCall({ ...retained, callerName: retained.callerName || activeCallerName, callerNumber: retained.callerNumber || dialpadNumber, duration: retained.duration ?? callDuration });
      setStableStatus("Caller is on hold. Select Resume to reconnect.");
    } catch (error) {
      setStableStatus(error instanceof Error ? error.message : "Could not retain the call. The caller remains connected.");
    } finally {
      retentionLockRef.current = false;
      setIsRetentionPending(false);
    }
  };

  const handleResumeHeldCall = async () => {
    if (!heldCall || pendingReconnect) return;
    await beginReconnect("held", heldCall);
  };

  const handleParkCall = async () => {
    const oldAgentCall = activeCallRef.current;
    if (!oldAgentCall || callState !== "in-call" || retentionLockRef.current) return;
    const activeCallSid = oldAgentCall.parameters.CallSid;
    if (!activeCallSid) return;
    retentionLockRef.current = true;
    setIsRetentionPending(true);
    try {
      await retainAgentCall<ParkedCall>(
        "parked",
        oldAgentCall,
        { callerName: activeCallerName, callerNumber: dialpadNumber, duration: callDuration },
        getAuthHeaders(),
        () => activeCallRef.current,
      );
      await refreshParkedCalls();
      setStableStatus("Call parked. It remains available in Parked Calls.");
    } catch (error) {
      setStableStatus(error instanceof Error ? error.message : "Could not park the call. The caller remains connected.");
    } finally {
      retentionLockRef.current = false;
      setIsRetentionPending(false);
    }
  };

  const handlePickupParkedCall = async (parkedCall: ParkedCall) => {
    if (pendingReconnect) return;
    await beginReconnect("parked", parkedCall);
  };

  const beginReconnect = async (kind: "held" | "parked", retained: HeldCall | ParkedCall) => {
    const reconnectToken = crypto.randomUUID();
    const headers = getAuthHeaders();
    const pending = lifecycleRef.current.beginReconnect(
      kind,
      retained.id,
      reconnectToken,
      retained.callerName || "",
      retained.callerNumber || "",
      { cancel: (value) => cancelReconnect(value, headers) },
    );
    if (!pending) return;
    setStableStatus(`Reconnecting ${retained.callerName || retained.callerNumber || "retained caller"}…`);
    try {
      const reconnect = await requestReconnect(kind, retained.id, reconnectToken, headers);
      // The matching provider call is allowed to arrive before this HTTP response.
      if (lifecycleRef.current.getPendingReconnect()?.token === reconnectToken) {
        lifecycleRef.current.confirmReconnect(reconnect);
      }
    } catch (error) {
      if (lifecycleRef.current.getPendingReconnect()?.token !== reconnectToken) return;
      lifecycleRef.current.failReconnect(error instanceof Error ? error.message : "Reconnect failed. The caller remains retained.");
      await Promise.all([refreshHeldCall(), refreshParkedCalls()]);
    }
  };

  const handleHangup = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
      activeCallRef.current = null;
      return;
    }
    setCallState("idle");
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshParkedCalls();
      refreshHeldCall();
      const interval = setInterval(() => {
        void refreshParkedCalls();
        void refreshHeldCall();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleToggleSpeaker = () => {
    const newSpeakerOn = !isSpeakerOn;
    setIsSpeakerOn(newSpeakerOn);

    const audioHelper = deviceRef.current?.audio;
    if (audioHelper && audioHelper.isOutputSelectionSupported) {
      if (newSpeakerOn) {
        audioHelper.speakerDevices.set("default").catch(() => {});
      } else {
        audioHelper.speakerDevices.set("").catch(() => {});
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "busy":
      case "failed":
      case "no-answer":
        return "bg-red-100 text-red-800";
      case "in-progress":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isRestoringSession) {
    return <div className="flex min-h-screen items-center justify-center" aria-label="Verifying phone session">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
    </div>;
  }

  if (!isAuthenticated) {
    if (product === "chiamo") return <ChiamoLogin returnTo="/softphone" initialError={sessionError} />;
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${connectShell ? "bg-[#062d31] bg-[radial-gradient(circle_at_top_right,_rgba(103,232,249,.2),_transparent_35%),linear-gradient(135deg,#062d31,#084b57)]" : "bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800"}`}>
        <Card className={`w-full max-w-md ${connectShell ? "border-emerald-100/20 bg-[#f7fbfa] shadow-2xl shadow-black/30" : ""}`}>
          <CardHeader className="text-center">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${connectShell ? "bg-emerald-600 ring-8 ring-emerald-600/15" : "bg-blue-600"}`}>
              <Phone className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">{connectShell ? "Chiamo Connect" : "Agent Softphone"}</CardTitle>
            <CardDescription>{connectShell ? "Sign in to your shared business calling workspace" : "Sign in to access your phone system"}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
              {loginError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {loginError}
                </div>
              )}
              {sessionError && (
                <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  {sessionError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="softphone-username">Username</Label>
                <Input
                  id="softphone-username"
                  name="softphone-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="off"
                  required
                  disabled={!!sessionError}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="softphone-password">Password</Label>
                <Input
                  id="softphone-password"
                  name="softphone-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  required
                  disabled={!!sessionError}
                />
              </div>
              <Button type="submit" className={`w-full ${connectShell ? "bg-emerald-600 hover:bg-emerald-700" : ""}`} disabled={isLoggingIn || !!sessionError}>
                {isLoggingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
            <div className="mt-4 border-t border-gray-200 pt-4 text-center">
              <Link href="/install" className={`inline-flex items-center gap-1.5 text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${connectShell ? "text-emerald-700" : "text-blue-600 dark:text-blue-400"}`}>
                <Download className="h-3.5 w-3.5" />
                Install app on your phone
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diagnosticDetail = connectionStatus === "offline"
    ? "Network disconnected. Calling will reconnect when the network returns."
    : connectionStatus === "reconnecting"
      ? "Network restored. Reconnecting phone registration."
      : pendingReconnect
        ? `${pendingReconnect.phase === "preparing"
          ? "Preparing"
          : pendingReconnect.phase === "canceling"
            ? "Canceling and restoring"
            : pendingReconnect.phase === "restoring"
              ? "Restoring"
              : "Waiting for"} retained-call reconnect for ${pendingReconnect.callerName || pendingReconnect.callerNumber || "caller"}.`
        : voiceTokenError
          ? `Phone service could not be reached: ${voiceTokenError instanceof Error ? voiceTokenError.message : "Token request failed."}`
          : providerError || listError || inlineStatus || "Registering this device with the phone provider.";

  return <ConnectPhoneWorkspace
    userName={user?.name}
    agentStatus={agentStatus}
    setAgentStatus={setAgentStatus}
    connectionStatus={connectionStatus}
    isProviderRegistered={isProviderRegistered}
    hasDiagnostic={Boolean(voiceTokenError || providerError || !isProviderRegistered || inlineStatus || listError || pendingReconnect || connectionStatus !== "online")}
    diagnosticDetail={diagnosticDetail}
    showRetry={Boolean(voiceTokenError || providerError)}
    retrying={isFetchingVoiceToken}
    onRetry={() => {
      if (voiceTokenError) void retryVoiceToken();
      else if (deviceRef.current) {
        setProviderError("");
        setIsProviderRegistered(false);
        deviceRef.current.register().catch((error: Error) => setProviderError(providerErrorMessage(error, "registration")));
      }
    }}
    pendingReconnect={pendingReconnect}
    onCancelReconnect={() => { void lifecycleRef.current.cancelReconnect("Reconnect cancelled. The caller remains retained.").finally(() => { void refreshHeldCall(); void refreshParkedCalls(); }); }}
    inbound={inboundCall ? { callerName: inboundCallerName, callerNumber: inboundCallerNumber } : null}
    onAcceptInbound={handleAcceptInbound}
    onRejectInbound={handleRejectInbound}
    callState={callState}
    callDuration={formatDuration(callDuration)}
    dialpadNumber={dialpadNumber}
    setDialpadNumber={setDialpadNumber}
    activeCallerName={activeCallerName}
    onDial={handleDialpadPress}
    onCall={() => { void handleCall(); }}
    callPreparing={initiateCallMutation.isPending || isDialPreparing}
    isMuted={isMuted}
    onMute={() => setIsMuted(!isMuted)}
    isSpeakerOn={isSpeakerOn}
    onSpeaker={handleToggleSpeaker}
    isRetentionPending={isRetentionPending}
    onHold={() => { void handleToggleHold(); }}
    onPark={() => { void handleParkCall(); }}
    onHangup={handleHangup}
    heldCall={heldCall}
    parkedCalls={parkedCalls}
    onResume={() => { void handleResumeHeldCall(); }}
    onPickup={(call) => { void handlePickupParkedCall(call); }}
    callerIdMode={callerIdMode}
    setCallerIdMode={setCallerIdMode}
    logs={callLogs}
    loadingLogs={loadingLogs}
    onLogClick={(log) => { if (callState === "idle") setDialpadNumber(log.direction === "outbound" ? log.toNumber : log.fromNumber); }}
    formatRelative={(date) => formatDistanceToNow(new Date(date), { addSuffix: true })}
    formatDuration={formatDuration}
    statusClass={getStatusColor}
    onLogout={handleLogout}
  />;
  /* Legacy authenticated rendering retired in favor of ConnectPhoneWorkspace.
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${connectShell ? "bg-emerald-600" : "bg-blue-600"}`}>
              <Phone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{connectShell ? "Chiamo Connect" : "Softphone"}</h1>
              <p className="text-sm text-gray-500">{connectShell ? `Business calling · ${user?.name}` : `Welcome, ${user?.name}`}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <select
                value={agentStatus}
                onChange={(e) => setAgentStatus(e.target.value as any)}
                aria-label="Agent availability"
                className={`rounded-md border px-2 py-1 text-sm ${connectShell ? "border-emerald-900/20 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600" : "bg-white dark:bg-gray-800"}`}
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="away">Away</option>
              </select>
              <div
                className={`w-3 h-3 rounded-full ${
                  agentStatus === "available"
                    ? "bg-green-500"
                    : agentStatus === "busy"
                    ? "bg-red-500"
                    : "bg-yellow-500"
                }`}
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className={connectShell ? "border-emerald-900/20 hover:bg-emerald-50" : ""}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {(voiceTokenError || providerError || !isProviderRegistered || inlineStatus || listError || pendingReconnect || connectionStatus !== "online") && (
          <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${
            voiceTokenError || providerError || connectionStatus === "offline" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            <span>
              {connectionStatus === "offline"
                ? "Network disconnected. Calling will reconnect when the network returns."
                : connectionStatus === "reconnecting"
                  ? "Network restored. Reconnecting phone registration…"
                : pendingReconnect
                  ? `${pendingReconnect.phase === "requesting" ? "Requesting" : "Waiting for"} retained-call reconnect for ${pendingReconnect.callerName || pendingReconnect.callerNumber || "caller"}…`
                : voiceTokenError
                ? `Phone service could not be reached: ${voiceTokenError instanceof Error ? voiceTokenError.message : "Token request failed."}`
                : providerError || listError || inlineStatus || "Registering this device with the phone provider…"}
            </span>
            {pendingReconnect && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void lifecycleRef.current.cancelReconnect("Reconnect cancelled. The caller remains retained.")
                    .finally(() => {
                      void refreshHeldCall();
                      void refreshParkedCalls();
                    });
                }}
              >
                Cancel reconnect
              </Button>
            )}
            {(voiceTokenError || providerError) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isFetchingVoiceToken}
                onClick={() => {
                  if (voiceTokenError) {
                    void retryVoiceToken();
                  } else if (deviceRef.current) {
                    setProviderError("");
                    setIsProviderRegistered(false);
                    deviceRef.current.register().catch((error: Error) => {
                      setProviderError(providerErrorMessage(error, "registration"));
                    });
                  }
                }}
              >
                {isFetchingVoiceToken ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Retry phone registration
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden rounded-[2rem] border-gray-900 bg-gray-950 text-white shadow-2xl">
            <CardHeader className="text-center pb-2 bg-gray-900">
              <CardTitle className="flex items-center justify-center gap-2"><Phone className="h-5 w-5" /> Phone</CardTitle>
              <CardDescription>
                {callState === "idle" && "Ready to make calls"}
                {callState === "connecting" && "Connecting..."}
                {callState === "ringing" && "Ringing..."}
                {callState === "in-call" && formatDuration(callDuration)}
                {callState === "ended" && "Call ended"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <Input
                  value={dialpadNumber}
                  onChange={(e) => setDialpadNumber(e.target.value)}
                  placeholder="Caller ID / number"
                  className="h-20 rounded-2xl border-gray-700 bg-black text-center font-mono text-2xl tracking-wider text-green-300 placeholder:text-green-700"
                  disabled={callState !== "idle"}
                />
              </div>
                <div className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-300">
                  <UserRound className="h-4 w-4" />
                  <span>{activeCallerName || (dialpadNumber ? "Name not found" : "Name and number show here")}</span>
                </div>

              {callState === "idle" && (
                <>
                  {heldCall && (
                    <div className="mb-4 rounded-xl border border-amber-500 bg-amber-950/40 p-4 text-amber-100">
                      <p className="font-semibold">{heldCall.callerName || heldCall.callerNumber} is on hold</p>
                      <p className="mb-3 text-sm text-amber-200">{heldCall.callerNumber}</p>
                      <Button className="w-full bg-amber-500 text-black hover:bg-amber-400" onClick={handleResumeHeldCall} disabled={!!pendingReconnect}>
                        <PhoneCall className="mr-2 h-4 w-4" /> {pendingReconnect?.id === heldCall.id ? "Reconnecting…" : "Resume held call"}
                      </Button>
                    </div>
                  )}
                  {/* Caller ID Mode Toggles * /}
                  <div className="flex items-center justify-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 mr-2">Caller ID:</span>
                    <Button
                      size="sm"
                      variant={callerIdMode === "private" ? "default" : "outline"}
                      onClick={() => setCallerIdMode(callerIdMode === "private" ? "auto" : "private")}
                      className={`h-8 px-3 ${callerIdMode === "private" ? "bg-gray-700 hover:bg-gray-600" : ""}`}
                    >
                      <EyeOff className="h-3 w-3 mr-1" />
                      Private
                    </Button>
                    <Button
                      size="sm"
                      variant={callerIdMode === "office" ? "default" : "outline"}
                      onClick={() => setCallerIdMode(callerIdMode === "office" ? "auto" : "office")}
                      className={`h-8 px-3 ${callerIdMode === "office" ? "bg-blue-600 hover:bg-blue-500" : ""}`}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      Office
                    </Button>
                    {callerIdMode !== "auto" && (
                      <span className="text-xs text-gray-400 ml-1">
                        {callerIdMode === "private" ? "(only when supported; otherwise the call will not be placed)" : "(configured office number required)"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {dialpadButtons.map((btn) => (
                      <Button
                        key={btn.digit}
                        variant="outline"
                        className="h-16 rounded-full border-gray-700 bg-gray-800 text-xl font-medium text-white hover:bg-gray-700 flex flex-col items-center justify-center"
                        onClick={() => handleDialpadPress(btn.digit)}
                      >
                        <span className="text-2xl">{btn.digit}</span>
                        {btn.letters && (
                          <span className="text-[10px] text-gray-400 tracking-widest">
                            {btn.letters}
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                  <div className="flex justify-center gap-4">
                    <Button
                      size="lg"
                      className="w-full h-14 bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleCall}
                      disabled={!dialpadNumber || initiateCallMutation.isPending || isDialPreparing}
                    >
                      {initiateCallMutation.isPending || isDialPreparing ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Phone className="h-6 w-6" />
                      )}
                      <span className="ml-2">Call</span>
                    </Button>
                  </div>
                </>
              )}

              {(callState === "connecting" || callState === "ringing") && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center animate-pulse">
                      <Phone className="h-10 w-10 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <p className="text-lg font-medium">{dialpadNumber}</p>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="w-full h-14"
                    onClick={handleHangup}
                  >
                    <PhoneOff className="h-6 w-6 mr-2" /> Cancel
                  </Button>
                </div>
              )}

              {callState === "in-call" && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center">
                    <PhoneCall className="h-10 w-10 text-white" />
                  </div>
                  <p className="text-lg font-medium">{activeCallerName || dialpadNumber}</p>
                  {activeCallerName && <p className="text-sm text-gray-400">{dialpadNumber}</p>}
                  <p className="text-3xl font-mono">{isOnHold ? "ON HOLD" : formatDuration(callDuration)}</p>
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className={isMuted ? "bg-red-100 dark:bg-red-900" : ""}
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    <Button variant="outline" size="lg" className={isOnHold ? "bg-yellow-100 text-yellow-900" : ""} onClick={handleToggleHold} disabled={isRetentionPending}>
                      {isRetentionPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Pause className="mr-2 h-5 w-5" /> Hold</>}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className={!isSpeakerOn ? "bg-red-100 dark:bg-red-900" : ""}
                      onClick={handleToggleSpeaker}
                    >
                      {isSpeakerOn ? (
                        <Volume2 className="h-5 w-5" />
                      ) : (
                        <VolumeX className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleParkCall} disabled={isRetentionPending}>
                    <ParkingCircle className="h-5 w-5 mr-2" /> Park call for anyone
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="w-full h-14"
                    onClick={handleHangup}
                  >
                    <PhoneOff className="h-6 w-6 mr-2" /> End Call
                  </Button>
                </div>
              )}

              {callState === "ended" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <PhoneOff className="h-10 w-10 text-gray-500" />
                  </div>
                  <p className="text-lg text-gray-500">Call ended</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ParkingCircle className="h-5 w-5" /> Parked Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parkedCalls.length === 0 ? (
                <p className="text-sm text-gray-500">No calls are parked. Parked calls appear here for every softphone user.</p>
              ) : (
                <div className="space-y-2">
                  {parkedCalls.map((parkedCall) => (
                    <div key={parkedCall.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{parkedCall.callerName || parkedCall.callerNumber}</p>
                        {parkedCall.callerName && <p className="text-sm text-gray-500">{parkedCall.callerNumber}</p>}
                        <p className="text-xs text-gray-400">Parked by {parkedCall.parkedBy}</p>
                      </div>
                      <Button size="sm" onClick={() => handlePickupParkedCall(parkedCall)} disabled={!!pendingReconnect}>
                        {pendingReconnect?.id === parkedCall.id ? "Reconnecting…" : "Pick up"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : callLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Phone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No call history yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {callLogs.slice(0, 20).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => {
                        if (callState === "idle") {
                          setDialpadNumber(log.direction === "outbound" ? log.toNumber : log.fromNumber);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            log.direction === "outbound"
                              ? "bg-blue-100 dark:bg-blue-900"
                              : "bg-green-100 dark:bg-green-900"
                          }`}
                        >
                          {log.direction === "outbound" ? (
                            <PhoneOutgoing className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <PhoneIncoming className="h-4 w-4 text-green-600 dark:text-green-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {log.direction === "outbound" ? log.toNumber : log.fromNumber}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.duration && (
                          <span className="text-sm text-gray-500">
                            {formatDuration(log.duration)}
                          </span>
                        )}
                        <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  ); */
}
