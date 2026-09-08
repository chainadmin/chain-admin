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
  // This is deliberately a ref rather than state: state is not updated until
  // after the click handler returns, leaving a double-click race otherwise.
  const acquisitionPendingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [acquiring, setAcquiring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const localUrlRef = useRef("");
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const cleanupCapture = () => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try {
      streamRef.current?.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
    } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    try { if (audioContextRef.current) void audioContextRef.current.close().catch(() => {}); } catch {}
    audioContextRef.current = null;
  };

  useEffect(() => () => {
    mountedRef.current = false;
    captureGenerationRef.current += 1;
    cleanupCapture();
    playerRef.current?.pause();
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  // cleanup intentionally runs only when this input unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (file: File) => {
    if (!mountedRef.current) return;
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
    captureGenerationRef.current += 1;
    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    cleanupCapture();
    if (mountedRef.current) setRecording(false);
    if (!samplesRef.current.length) return;
    const blob = pcmToWav(samplesRef.current, sampleRate);
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const nextLocalUrl = URL.createObjectURL(blob);
    localUrlRef.current = nextLocalUrl;
    if (!mountedRef.current) {
      URL.revokeObjectURL(nextLocalUrl);
      localUrlRef.current = "";
      return;
    }
    setLocalUrl(nextLocalUrl);
    await upload(new File([blob], "greeting-recording.wav", { type: "audio/wav" }));
  };

  const startRecording = async () => {
    if (acquisitionPendingRef.current || recording || streamRef.current || audioContextRef.current) return;
    acquisitionPendingRef.current = true;
    const generation = ++captureGenerationRef.current;
    setError("");
    setAcquiring(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Register each resource before any operation that can throw, so every
      // partial setup is owned by cleanupCapture.
      streamRef.current = stream;
      if (!mountedRef.current || captureGenerationRef.current !== generation) {
        cleanupCapture();
        return;
      }
      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
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
      if (!mountedRef.current || captureGenerationRef.current !== generation) {
        cleanupCapture();
        return;
      }
      setRecording(true);
    } catch (caught) {
      cleanupCapture();
      if (mountedRef.current) setError(caught instanceof Error ? "Microphone access was not available." : "Microphone access was not available.");
    } finally {
      acquisitionPendingRef.current = false;
      if (mountedRef.current) setAcquiring(false);
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
        // A file replacement supersedes an unresolved microphone request.
        // Its late stream is stopped before it can create an AudioContext.
        captureGenerationRef.current += 1;
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
      <Button type="button" size="sm" variant={recording ? "destructive" : "outline"} disabled={uploading || acquiring} onClick={() => { if (recording) void stopRecording(); else void startRecording(); }}>
        {recording ? <Square className="mr-2 h-3.5 w-3.5" /> : <Mic className="mr-2 h-3.5 w-3.5" />}{recording ? "Stop recording" : acquiring ? "Opening microphone…" : "Record greeting"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={recording || acquiring || uploading} onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-3.5 w-3.5" />Replace with file</Button>
      {hasAudio && <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={playing ? () => { playerRef.current?.pause(); setPlaying(false); } : play}>{playing ? <Pause className="mr-2 h-3.5 w-3.5" /> : <Play className="mr-2 h-3.5 w-3.5" />}{playing ? "Stop preview" : "Preview audio"}</Button>}
      {uploading && <span className={`flex items-center text-xs ${muted}`}><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Uploading</span>}
    </div>
    {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
  </div>;
}