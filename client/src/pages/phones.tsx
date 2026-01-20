import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Clock,
  User,
  Play,
  Pause,
  Download,
  Plus,
  Trash2,
  Star,
  PhoneIncoming,
  PhoneOutgoing,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  History,
  Hash,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface VoipPhoneNumber {
  id: string;
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  friendlyName: string;
  twilioPhoneSid: string | null;
  isPrimary: boolean;
  isActive: boolean;
  capabilities: { voice: boolean; sms: boolean };
  createdAt: string;
  updatedAt: string | null;
}

interface VoipCallLog {
  id: string;
  tenantId: string;
  callSid: string | null;
  consumerId: string | null;
  accountId: string | null;
  agentCredentialId: string | null;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  status: string;
  duration: number | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  recordingDuration: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

type CallState = "idle" | "connecting" | "ringing" | "in-call" | "ended";

export default function PhonesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dialpad");
  const [dialpadNumber, setDialpadNumber] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [agentStatus, setAgentStatus] = useState<"available" | "busy" | "away">("available");
  const [showAddPhoneDialog, setShowAddPhoneDialog] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newPhoneFriendlyName, setNewPhoneFriendlyName] = useState("");
  const [newPhoneIsPrimary, setNewPhoneIsPrimary] = useState(false);
  const [selectedCallLog, setSelectedCallLog] = useState<VoipCallLog | null>(null);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: phoneNumbers = [], isLoading: loadingNumbers } = useQuery<VoipPhoneNumber[]>({
    queryKey: ["/api/voip/phone-numbers"],
  });

  const { data: callLogs = [], isLoading: loadingLogs } = useQuery<VoipCallLog[]>({
    queryKey: ["/api/voip/call-logs"],
  });

  const { data: voiceToken } = useQuery<{ token: string; identity: string }>({
    queryKey: ["/api/voip/token"],
    refetchInterval: 1000 * 60 * 55,
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

  const addPhoneNumberMutation = useMutation({
    mutationFn: (data: { phoneNumber: string; friendlyName: string; isPrimary: boolean }) =>
      apiRequest("POST", "/api/voip/phone-numbers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({ title: "Success", description: "Phone number added successfully" });
      setShowAddPhoneDialog(false);
      setNewPhoneNumber("");
      setNewPhoneFriendlyName("");
      setNewPhoneIsPrimary(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add phone number",
        variant: "destructive",
      });
    },
  });

  const deletePhoneNumberMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/voip/phone-numbers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({ title: "Success", description: "Phone number deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phone number",
        variant: "destructive",
      });
    },
  });

  const updatePhoneNumberMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<VoipPhoneNumber>) =>
      apiRequest("PATCH", `/api/voip/phone-numbers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({ title: "Success", description: "Phone number updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update phone number",
        variant: "destructive",
      });
    },
  });

  const initiateCallMutation = useMutation({
    mutationFn: (toNumber: string) =>
      apiRequest("POST", "/api/voip/call", { toNumber }),
    onSuccess: (data: any) => {
      toast({
        title: "Call Initiated",
        description: `Calling ${data.toNumber} from ${data.fromNumber}`,
      });
      setCallState("connecting");
      setTimeout(() => setCallState("ringing"), 1500);
      setTimeout(() => setCallState("in-call"), 4000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate call",
        variant: "destructive",
      });
      setCallState("idle");
    },
  });

  const updateCallNotesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PATCH", `/api/voip/call-logs/${id}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/call-logs"] });
      toast({ title: "Success", description: "Notes saved" });
      setShowNotesDialog(false);
      setSelectedCallLog(null);
      setCallNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save notes",
        variant: "destructive",
      });
    },
  });

  const handleDialpadPress = (digit: string) => {
    setDialpadNumber((prev) => prev + digit);
  };

  const handleCall = () => {
    if (!dialpadNumber) {
      toast({
        title: "Enter a number",
        description: "Please enter a phone number to call",
        variant: "destructive",
      });
      return;
    }
    if (phoneNumbers.length === 0) {
      toast({
        title: "No phone numbers",
        description: "Please add a phone number first before making calls",
        variant: "destructive",
      });
      return;
    }
    initiateCallMutation.mutate(dialpadNumber);
  };

  const handleHangup = () => {
    setCallState("ended");
    setTimeout(() => {
      setCallState("idle");
      setDialpadNumber("");
    }, 1000);
  };

  const playRecording = async (log: VoipCallLog) => {
    if (!log.recordingUrl) return;

    if (playingRecordingId === log.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingRecordingId(null);
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(log.recordingUrl);
      audioRef.current.play();
      setPlayingRecordingId(log.id);
      audioRef.current.onended = () => setPlayingRecordingId(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to play recording",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "in-progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "no-answer":
      case "busy":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "failed":
      case "canceled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

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

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Phone System</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Make and receive calls directly from your browser
            </p>
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
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-[400px]">
            <TabsTrigger value="dialpad" className="flex items-center gap-2">
              <Hash className="h-4 w-4" /> Dialpad
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" /> Call History
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Phone Numbers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dialpad" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="max-w-md mx-auto lg:mx-0">
                <CardHeader className="text-center pb-2">
                  <CardTitle>Softphone</CardTitle>
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
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {callLogs.slice(0, 10).map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => {
                            setSelectedCallLog(log);
                            setCallNotes(log.notes || "");
                            setShowNotesDialog(true);
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
                            {log.recordingUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playRecording(log);
                                }}
                              >
                                {playingRecordingId === log.id ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Call History</CardTitle>
                <CardDescription>View all your past calls and recordings</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : callLogs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Phone className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">No call history yet</p>
                    <p className="text-sm">Your calls will appear here</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Direction</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Recording</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {log.direction === "outbound" ? (
                                <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                              ) : (
                                <PhoneIncoming className="h-4 w-4 text-green-600" />
                              )}
                              <span className="capitalize">{log.direction}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">
                            {log.direction === "outbound" ? log.toNumber : log.fromNumber}
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {log.duration ? formatDuration(log.duration) : "-"}
                          </TableCell>
                          <TableCell>
                            {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                          </TableCell>
                          <TableCell>
                            {log.recordingUrl ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => playRecording(log)}
                                >
                                  {playingRecordingId === log.id ? (
                                    <Pause className="h-4 w-4" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                                <a
                                  href={log.recordingUrl}
                                  download
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedCallLog(log);
                                setCallNotes(log.notes || "");
                                setShowNotesDialog(true);
                              }}
                            >
                              Notes
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Phone Numbers</CardTitle>
                  <CardDescription>Manage your VoIP phone numbers</CardDescription>
                </div>
                <Button onClick={() => setShowAddPhoneDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add Number
                </Button>
              </CardHeader>
              <CardContent>
                {loadingNumbers ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : phoneNumbers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Phone className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">No phone numbers configured</p>
                    <p className="text-sm mb-4">Add your Twilio phone numbers to start making calls</p>
                    <Button onClick={() => setShowAddPhoneDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" /> Add Your First Number
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone Number</TableHead>
                        <TableHead>Area Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Primary</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {phoneNumbers.map((phone) => (
                        <TableRow key={phone.id}>
                          <TableCell className="font-mono">{phone.phoneNumber}</TableCell>
                          <TableCell>{phone.areaCode}</TableCell>
                          <TableCell>{phone.friendlyName}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                phone.isActive
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }
                            >
                              {phone.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {phone.isPrimary ? (
                              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  updatePhoneNumberMutation.mutate({
                                    id: phone.id,
                                    isPrimary: true,
                                  })
                                }
                              >
                                <Star className="h-4 w-4 text-gray-300" />
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={phone.isActive}
                                onCheckedChange={(checked) =>
                                  updatePhoneNumberMutation.mutate({
                                    id: phone.id,
                                    isActive: checked,
                                  })
                                }
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-800"
                                onClick={() => deletePhoneNumberMutation.mutate(phone.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showAddPhoneDialog} onOpenChange={setShowAddPhoneDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Phone Number</DialogTitle>
              <DialogDescription>
                Add a Twilio phone number to use for making and receiving calls
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
                <p className="text-sm text-gray-500">
                  Enter the phone number you purchased from Twilio
                </p>
              </div>
              <div className="space-y-2">
                <Label>Friendly Name (optional)</Label>
                <Input
                  value={newPhoneFriendlyName}
                  onChange={(e) => setNewPhoneFriendlyName(e.target.value)}
                  placeholder="Main Office Line"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isPrimary"
                  checked={newPhoneIsPrimary}
                  onCheckedChange={setNewPhoneIsPrimary}
                />
                <Label htmlFor="isPrimary">Set as primary number</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddPhoneDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  addPhoneNumberMutation.mutate({
                    phoneNumber: newPhoneNumber,
                    friendlyName: newPhoneFriendlyName,
                    isPrimary: newPhoneIsPrimary,
                  })
                }
                disabled={!newPhoneNumber || addPhoneNumberMutation.isPending}
              >
                {addPhoneNumberMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Add Number
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Call Notes</DialogTitle>
              <DialogDescription>
                {selectedCallLog && (
                  <span>
                    {selectedCallLog.direction === "outbound" ? "Called" : "Received from"}{" "}
                    {selectedCallLog.direction === "outbound"
                      ? selectedCallLog.toNumber
                      : selectedCallLog.fromNumber}{" "}
                    on {format(new Date(selectedCallLog.createdAt), "MMM d, yyyy")}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Add notes about this call..."
                rows={6}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNotesDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedCallLog &&
                  updateCallNotesMutation.mutate({ id: selectedCallLog.id, notes: callNotes })
                }
                disabled={updateCallNotesMutation.isPending}
              >
                {updateCallNotesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save Notes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
