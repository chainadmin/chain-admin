import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Mic, Pause, Play, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { MAX_GREETING_AUDIO_BYTES, pcmByteLength, pcmToWav, type GreetingAudioUpload } from "./greeting-audio";

type Props = {
  audioUrl?: string | null;
  previewUrl?: string | null;
  dark?: boolean;
  onUploaded: (upload: GreetingAudioUpload) => void;
};

export function GreetingAudioInput({ audioUrl, previewUrl, dark = false, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const sampleCountRef = useRef(0);
  const mountedRef = useRef(true);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const localUrlRef = useRef("");
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const cleanupCapture = () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
  };

  useEffect(() => () => {
    mountedRef.current = false;
    cleanupCapture();
    playerRef.current?.pause();
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  // cleanup intentionally runs only when this input unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (file: File) => {
    if (file.size > MAX_GREETING_AUDIO_BYTES) {
      setError("Audio must be smaller than 10 MB.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", file);
      const response = await apiRequest("POST", "/api/voip/settings/greeting-audio", form);
      const result = await response.json() as GreetingAudioUpload;
      if (!result.audioUrl || !result.previewUrl) throw new Error("The uploaded audio could not be prepared.");
      if (mountedRef.current) onUploaded(result);
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : "Audio upload failed. Try again.");
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  };

  const stopRecording = async () => {
    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    cleanupCapture();
    setRecording(false);
    if (!samplesRef.current.length) return;
    const blob = pcmToWav(samplesRef.current, sampleRate);
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const nextLocalUrl = URL.createObjectURL(blob);
    localUrlRef.current = nextLocalUrl;
    setLocalUrl(nextLocalUrl);
    await upload(new File([blob], "greeting-recording.wav", { type: "audio/wav" }));
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      samplesRef.current = [];
      sampleCountRef.current = 0;
      processor.onaudioprocess = (event) => {
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        const nextCount = sampleCountRef.current + chunk.length;
        if (pcmByteLength(nextCount) >= MAX_GREETING_AUDIO_BYTES) {
          void stopRecording();
          return;
        }
        samplesRef.current.push(chunk);
        sampleCountRef.current = nextCount;
      };
      source.connect(processor);
      processor.connect(context.destination);
      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      setRecording(true);
    } catch (caught) {
      cleanupCapture();
      setError(caught instanceof Error ? "Microphone access was not available." : "Microphone access was not available.");
    }
  };

  const play = () => {
    const url = localUrl || previewUrl || audioUrl;
    if (!url) return;
    playerRef.current?.pause();
    const audio = new Audio(url);
    playerRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => { setPlaying(false); setError("This audio preview could not be played."); };
    setPlaying(true);
    void audio.play().catch(() => { setPlaying(false); setError("This audio preview could not be played."); });
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!["audio/mpeg", "audio/wav", "audio/x-wav"].includes(file.type) && !/\.(mp3|wav)$/i.test(file.name)) {
        setError("Choose an MP3 or WAV file.");
      } else {
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
        const nextLocalUrl = URL.createObjectURL(file);
        localUrlRef.current = nextLocalUrl;
        setLocalUrl(nextLocalUrl);
        void upload(file);
      }
    }
    event.target.value = "";
  };
  const muted = dark ? "text-blue-100/60" : "text-slate-500";
  const hasAudio = Boolean(localUrl || previewUrl || audioUrl);

  return <div className={`mt-4 rounded-xl border p-4 ${dark ? "border-white/10 bg-slate-950/20" : "border-slate-200 bg-slate-50/70"}`}>
    <input ref={inputRef} className="sr-only" type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={selectFile} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">Greeting audio</p><p className={`mt-0.5 text-xs ${muted}`}>{recording ? "Recording from your microphone. Stop when finished." : uploading ? "Preparing a secure preview…" : hasAudio ? "Audio is staged. Save this page to make it live." : "Record a message or upload an MP3 or WAV file."}</p></div>
      {hasAudio && <span className={`inline-flex items-center gap-1 text-xs font-semibold ${dark ? "text-sky-200" : "text-emerald-700"}`}><Check className="h-3.5 w-3.5" />Ready to save</span>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant={recording ? "destructive" : "outline"} disabled={uploading} onClick={() => { if (recording) void stopRecording(); else void startRecording(); }}>
        {recording ? <Square className="mr-2 h-3.5 w-3.5" /> : <Mic className="mr-2 h-3.5 w-3.5" />}{recording ? "Stop recording" : "Record greeting"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={recording || uploading} onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-3.5 w-3.5" />Replace with file</Button>
      {hasAudio && <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={playing ? () => { playerRef.current?.pause(); setPlaying(false); } : play}>{playing ? <Pause className="mr-2 h-3.5 w-3.5" /> : <Play className="mr-2 h-3.5 w-3.5" />}{playing ? "Stop preview" : "Preview audio"}</Button>}
      {uploading && <span className={`flex items-center text-xs ${muted}`}><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Uploading</span>}
    </div>
    {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
  </div>;
}