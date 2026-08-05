"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

interface SoundEvent {
  label: string;
  category?: string;
  confidence: number;
  start: number;
  end: number;
  distance?: string;
  distance_score?: number;
  intensity?: string;
  intensity_pct?: number;
}

interface LivePayload {
  chunk_id?: number;
  timestamp?: number;
  transcript_delta?: string;
  active_speakers?: string[];
  sound_events?: SoundEvent[];
  intensity_pct?: number;
  connection_state?: string;
  message_type?: string;
  text?: string;
  audio_start?: number;
  audio_end?: number;
}

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  time: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Natural: "🌿",
  Artificial: "⚙️",
  "Human Activity": "🤧",
  Music: "🎵",
  Animal: "🐾",
  Unclassified: "❓",
};

export default function LiveDashboard() {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [latestPayload, setLatestPayload] = useState<LivePayload | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Audio buffer parameters
  const SAMPLE_RATE = 16000;
  const BUFFER_SIZE = 4096;
  const TARGET_CHUNK_SIZE = 64000; // 2 seconds of 16kHz 16-bit mono PCM

  // 1. Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (connectionState === "connected") {
        setElapsedSeconds((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [connectionState]);

  // 2. Scroll transcript feed automatically
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // 3. Connect to WebSocket & start recording
  useEffect(() => {
    let active = true;
    let accumulatedPCM = new Int16Array(0);

    const initLiveSession = async () => {
      try {
        setErrorMsg(null);
        setConnectionState("connecting");

        // Fetch backend URL from config endpoint
        const configRes = await fetch("/api/config");
        if (!active) return;
        if (!configRes.ok) throw new Error("Failed to load backend config");
        const { backendUrl } = await configRes.json();

        // Convert http/https to ws/wss
        const wsBaseUrl = backendUrl.replace(/^http/, "ws");
        const wsUrl = `${wsBaseUrl}/api/live/ws`;

        console.log(`[Live Web] Connecting to WebSocket: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          if (!active) return;
          console.log("[Live Web] WebSocket connected ✓");
          setConnectionState("connected");

          // Start browser microphone recording
          try {
            await startRecording();
          } catch (recErr: any) {
            console.error("[Live Web] Recording init failed:", recErr);
            setErrorMsg(recErr?.message || "Failed to access microphone. Please check permissions.");
            setConnectionState("error");
            ws.close();
          }
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const payload: LivePayload = JSON.parse(event.data);
            console.log("[Live Web] Received payload:", payload);

            if (payload.message_type === "Error") {
              setErrorMsg(payload.text || "An error occurred during chunk processing.");
              return;
            }

            setLatestPayload(payload);

            // Add to live transcript if we have a transcript delta
            const text = payload.transcript_delta || payload.text || "";
            if (text) {
              const date = new Date();
              const timeStr = `${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
              const speaker = payload.active_speakers?.[0] || "Speaker A";
              
              setTranscript((prev) => [
                ...prev,
                {
                  id: `live-${Date.now()}-${Math.random()}`,
                  speaker,
                  text,
                  time: timeStr,
                },
              ]);
            }
          } catch (parseErr) {
            console.error("[Live Web] Failed to parse message:", parseErr);
          }
        };

        ws.onclose = () => {
          if (!active) return;
          console.log("[Live Web] WebSocket disconnected");
          setConnectionState("disconnected");
          stopRecording();
        };

        ws.onerror = (wsErr) => {
          if (!active) return;
          console.error("[Live Web] WebSocket error:", wsErr);
          setConnectionState("error");
        };

      } catch (err: any) {
        console.error("[Live Web] Setup error:", err);
        setErrorMsg(err?.message || "Failed to initialize live session");
        setConnectionState("error");
      }
    };

    const startRecording = async () => {
      // 1. Get browser microphone media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 2. Initialize AudioContext downsampled to 16kHz
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // 3. Create ScriptProcessorNode to capture chunks
      const scriptProcessor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        // Channel data floats [-1.0, 1.0]
        const inputData = event.inputBuffer.getChannelData(0);

        // Convert to Int16 PCM samples
        const int16PCM = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16PCM[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Accumulate samples
        const newBuf = new Int16Array(accumulatedPCM.length + int16PCM.length);
        newBuf.set(accumulatedPCM, 0);
        newBuf.set(int16PCM, accumulatedPCM.length);
        accumulatedPCM = newBuf;

        // When the accumulated PCM buffer size reaches 64,000 bytes (32,000 samples)
        const targetSamples = TARGET_CHUNK_SIZE / 2; // 16-bit is 2 bytes per sample
        if (accumulatedPCM.length >= targetSamples) {
          const chunkToSend = accumulatedPCM.slice(0, targetSamples);
          accumulatedPCM = accumulatedPCM.slice(targetSamples);

          // Send binary PCM bytes over WebSocket
          console.log(`[Live Web] Sending chunk of size: ${chunkToSend.byteLength} bytes`);
          wsRef.current.send(chunkToSend.buffer);
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);
    };

    const stopRecording = () => {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      accumulatedPCM = new Int16Array(0);
    };

    initLiveSession();

    return () => {
      active = false;
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleStop = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    router.push("/");
  };

  const activeSpeakers = latestPayload?.active_speakers || ["Speaker A"];
  const soundEvents = latestPayload?.sound_events || [];
  const chunkId = latestPayload?.chunk_id || 0;
  const intensityPct = latestPayload?.intensity_pct || 25;

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600).toString().padStart(2, "0");
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const secs = (s % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  const getStatusText = () => {
    switch (connectionState) {
      case "connected":
        return "Listening…";
      case "connecting":
        return "Connecting…";
      case "reconnecting":
        return "Reconnecting…";
      case "error":
        return "Error";
      default:
        return "Stopped";
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case "connected":
        return "#4edea3"; // Tertiary green
      case "connecting":
      case "reconnecting":
        return "#F59E0B"; // Warning yellow
      case "error":
        return "#ffb4ab"; // Error red
      default:
        return "#a2a0b3"; // Surface variant grey
    }
  };

  return (
    <>
      <Navbar />
      <main className="relative z-10 pt-20 pb-16 px-6 max-w-4xl mx-auto">
        
        {/* Header bar */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2.5">
              Live Local Intelligence
              <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3] animate-pulse" />
            </h1>
            <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
              Continuous session duration: {formatTime(elapsedSeconds)}
            </p>
          </div>
          <button
            onClick={handleStop}
            className="px-4 py-1.5 rounded-full border border-[#ffb4ab]/40 text-[#ffb4ab] text-xs font-bold uppercase tracking-wider hover:bg-[#ffb4ab]/10 transition-colors"
          >
            STOP
          </button>
        </div>

        {/* Error box */}
        {errorMsg && (
          <div className="glass-panel p-4 mb-6 border-red-500/20 bg-red-500/5 animate-fade-in-up">
            <p className="text-xs text-[#ffb4ab] font-medium">⚠️ {errorMsg}</p>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in-up delay-100">
          <div className="glass-panel p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Active Speakers
            </span>
            <span className="text-xl font-bold text-[var(--color-primary)]">
              {String(activeSpeakers.length).padStart(2, "0")}
            </span>
          </div>
          <div className="glass-panel p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Chunks Processed
            </span>
            <span className="text-xl font-bold text-[var(--color-secondary)]">
              {String(chunkId).padStart(2, "0")}
            </span>
          </div>
          <div className="glass-panel p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-1">
              Status
            </span>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getStatusColor() }}
              />
              <span
                className="text-xs font-bold"
                style={{ color: getStatusColor() }}
              >
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Live Panels layout */}
        <div className="space-y-6">

          {/* Panel 1: Live Transcript */}
          <div className="glass-panel p-6 animate-fade-in-up delay-200">
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                🎤 Live Transcript
              </h3>
              <span className="text-[9px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded border border-[var(--color-primary)]/20 uppercase">
                ASR (&lt;500ms)
              </span>
            </div>

            <div
              ref={transcriptContainerRef}
              className="h-44 overflow-y-auto space-y-4 pr-2 scrollbar-thin"
            >
              {transcript.length === 0 ? (
                <p className="text-xs text-[var(--color-on-surface-variant)] italic pt-4">
                  Listening for speech in real-time...
                </p>
              ) : (
                transcript.map((entry) => (
                  <div key={entry.id} className="space-y-1.5 animate-slide-in">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded font-bold bg-[#c0c1ff]/10 text-[#c0c1ff] border border-[#c0c1ff]/20">
                        {entry.speaker}
                      </span>
                      <span className="text-[var(--color-on-surface-variant)]">
                        {entry.time}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium leading-relaxed">
                      {entry.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Panel 2: Active Speakers */}
          <div className="glass-panel p-6 animate-fade-in-up delay-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">
                👥 Active Speakers
              </h3>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold">
                VAD IDENTIFIED
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {activeSpeakers.map((spk) => (
                <div
                  key={spk}
                  className="flex items-center gap-2.5 bg-white/[0.04] border border-[var(--color-primary)]/20 rounded-full px-4 py-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                  <span className="text-xs font-bold text-[var(--color-primary)]">
                    {spk}
                  </span>
                  <span className="text-[10px] text-[var(--color-on-surface-variant)] font-semibold">
                    Speaking
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 3: Background Sounds & Distance Map */}
          <div className="glass-panel p-6 animate-fade-in-up delay-400">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">
                🔊 Background Sounds & 📍 Distance Map
              </h3>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold uppercase">
                YAMNet + RMS
              </span>
            </div>

            <div className="space-y-3">
              {soundEvents.length === 0 ? (
                <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-base text-[var(--color-primary)]">🔉</span>
                    <span className="text-xs text-white font-medium">Ambient Background</span>
                  </div>
                  <span className="text-[10px] font-bold bg-white/5 text-[var(--color-on-surface-variant)] px-2.5 py-1 rounded-full">
                    📍 Mid (1–5m)
                  </span>
                </div>
              ) : (
                soundEvents.map((ev, idx) => {
                  const icon = CATEGORY_ICONS[ev.category || "Artificial"] || "🔉";
                  const distTier = ev.distance || "Mid";
                  const distColor =
                    distTier === "Near" ? "text-emerald-400 border-emerald-500/30" : distTier === "Far" ? "text-purple-300 border-purple-500/30" : "text-amber-300 border-amber-500/30";

                  return (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-white/[0.02] border border-white/5 rounded-xl p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{icon}</span>
                        <div>
                          <p className="text-xs text-white font-semibold">
                            {ev.label === "Unknown Sound" ? "Unrecognized Sound" : ev.label}
                          </p>
                          <p className="text-[10px] text-[var(--color-on-surface-variant)] mt-0.5">
                            {ev.category || "Artificial"} • {Math.round(ev.confidence * 100)}% conf
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold border px-2.5 py-1 rounded-full ${distColor}`}>
                        {distTier === "Near" ? "🎯 Near (<1m)" : distTier === "Far" ? "📡 Far (>5m)" : "📍 Mid (1–5m)"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Panel 4: Intensity VU Meter */}
          <div className="glass-panel p-6 animate-fade-in-up delay-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">
                📊 Live Intensity VU Meter
              </h3>
              <span className="text-xs font-bold text-[var(--color-secondary)]">
                {Math.round(intensityPct)}% Peak RMS
              </span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-[var(--color-on-surface-variant)]">
                  <span>Micro-Loudness</span>
                  <span>
                    {intensityPct > 70 ? "🔴 High" : intensityPct >= 30 ? "🟡 Medium" : "🟢 Low"}
                  </span>
                </div>
                {/* VU Track */}
                <div className="h-2.5 bg-white/[0.05] rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(5, Math.min(100, intensityPct))}%`,
                      backgroundColor:
                        intensityPct > 70
                          ? "#ffb4ab" // Red
                          : intensityPct >= 30
                            ? "#F59E0B" // Orange
                            : "#4edea3", // Green
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

      </main>
    </>
  );
}
