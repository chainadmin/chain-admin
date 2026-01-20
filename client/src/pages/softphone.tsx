import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone, PhoneCall, PhoneOff, PhoneOutgoing, PhoneIncoming, Mic, MicOff, Volume2, VolumeX, History, LogOut } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

interface AgentUser {
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string;
  voipAccess: boolean;
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
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AgentUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [dialpadNumber, setDialpadNumber] = useState("");
  const [callState, setCallState] = useState<"idle" | "connecting" | "ringing" | "in-call" | "ended">("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [agentStatus, setAgentStatus] = useState<"available" | "busy" | "away">("available");

  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("softphone_token");
    const storedUser = localStorage.getItem("softphone_user");
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.voipAccess) {
          setUser(parsedUser);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("softphone_token");
          localStorage.removeItem("softphone_user");
        }
      } catch (e) {
        localStorage.removeItem("softphone_token");
        localStorage.removeItem("softphone_user");
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.message || "Login failed");
        setIsLoggingIn(false);
        return;
      }

      if (!data.credential?.voipAccess) {
        setLoginError("You don't have VoIP access. Please contact your administrator.");
        setIsLoggingIn(false);
        return;
      }

      const agentUser: AgentUser = {
        id: data.credential.id,
        username: data.credential.username,
        name: data.credential.name,
        role: data.credential.role,
        tenantId: data.credential.tenantId,
        voipAccess: data.credential.voipAccess,
      };

      localStorage.setItem("softphone_token", data.token);
      localStorage.setItem("softphone_user", JSON.stringify(agentUser));
      setUser(agentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setLoginError("Connection error. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("softphone_token");
    localStorage.removeItem("softphone_user");
    setIsAuthenticated(false);
    setUser(null);
    setUsername("");
    setPassword("");
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("softphone_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleAuthError = () => {
    localStorage.removeItem("softphone_token");
    localStorage.removeItem("softphone_user");
    setIsAuthenticated(false);
    setUser(null);
    toast({
      title: "Session expired",
      description: "Please sign in again",
      variant: "destructive",
    });
  };

  const { data: callLogs = [], isLoading: loadingLogs } = useQuery<VoipCallLog[]>({
    queryKey: ["/api/voip/call-logs"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await fetch("/api/voip/call-logs", {
        headers: getAuthHeaders(),
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) throw new Error("Failed to fetch call logs");
      return response.json();
    },
  });

  const { data: voiceToken } = useQuery<{ token: string; identity: string }>({
    queryKey: ["/api/voip/token"],
    enabled: isAuthenticated,
    refetchInterval: 1000 * 60 * 55,
    queryFn: async () => {
      const response = await fetch("/api/voip/token", {
        headers: getAuthHeaders(),
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) throw new Error("Failed to fetch voice token");
      return response.json();
    },
  });

  const initiateCallMutation = useMutation({
    mutationFn: async (toNumber: string) => {
      const response = await fetch("/api/voip/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ toNumber }),
      });
      if (response.status === 401 || response.status === 403) {
        handleAuthError();
        throw new Error("Access denied");
      }
      if (!response.ok) throw new Error("Failed to initiate call");
      return response.json();
    },
    onSuccess: () => {
      setCallState("connecting");
      queryClient.invalidateQueries({ queryKey: ["/api/voip/call-logs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Call failed",
        description: error.message || "Could not initiate call",
        variant: "destructive",
      });
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

  const handleCall = () => {
    if (!dialpadNumber) return;
    initiateCallMutation.mutate(dialpadNumber);
  };

  const handleHangup = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
      activeCallRef.current = null;
    }
    setCallState("ended");
    setTimeout(() => {
      setCallState("idle");
      setDialpadNumber("");
    }, 2000);
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
              <Phone className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Agent Softphone</CardTitle>
            <CardDescription>Sign in to access your phone system</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {loginError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <Phone className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Softphone</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <select
                value={agentStatus}
                onChange={(e) => setAgentStatus(e.target.value as any)}
                className="text-sm border rounded-md px-2 py-1 bg-white dark:bg-gray-800"
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
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="text-center pb-2">
              <CardTitle>Dialpad</CardTitle>
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
                  placeholder="Enter phone number"
                  className="text-2xl text-center font-mono tracking-wider h-14"
                  disabled={callState !== "idle"}
                />
              </div>

              {callState === "idle" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {dialpadButtons.map((btn) => (
                      <Button
                        key={btn.digit}
                        variant="outline"
                        className="h-16 text-xl font-medium flex flex-col items-center justify-center"
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
                      disabled={!dialpadNumber || initiateCallMutation.isPending}
                    >
                      {initiateCallMutation.isPending ? (
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
                  <p className="text-lg font-medium">{dialpadNumber}</p>
                  <p className="text-3xl font-mono">{formatDuration(callDuration)}</p>
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className={isMuted ? "bg-red-100 dark:bg-red-900" : ""}
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className={!isSpeakerOn ? "bg-red-100 dark:bg-red-900" : ""}
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                    >
                      {isSpeakerOn ? (
                        <Volume2 className="h-5 w-5" />
                      ) : (
                        <VolumeX className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
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
  );
}
