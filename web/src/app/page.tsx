"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Waveform from "@/components/Waveform";
import AudioUploader from "@/components/AudioUploader";
import ProcessingOverlay from "@/components/ProcessingOverlay";

const FEATURES = [
  {
    icon: "🎙️",
    title: "Speaker Detection",
    description: "Accurately count and identify distinct speakers in any audio recording using AI diarization.",
    color: "#c0c1ff",
  },
  {
    icon: "📝",
    title: "Smart Transcript",
    description: "Generate timestamped, speaker-attributed transcripts with color-coded conversation flow.",
    color: "#4cd7f6",
  },
  {
    icon: "🔊",
    title: "Sound Classification",
    description: "Detect and categorize background sounds — from keyboard clicks to distant traffic.",
    color: "#4edea3",
  },
  {
    icon: "📍",
    title: "Spatial Analysis",
    description: "Estimate distance and intensity of each sound source for spatial context awareness.",
    color: "#F59E0B",
  },
];

const TECH_STACK = [
  { name: "React Native", role: "Mobile Framework", icon: "⚛️" },
  { name: "FastAPI", role: "Backend API", icon: "⚡" },
  { name: "AssemblyAI", role: "Speech-to-Text", icon: "🗣️" },
  { name: "pyannote.audio", role: "Speaker Diarization", icon: "🎯" },
  { name: "Whisper", role: "Local ASR Fallback", icon: "🤫" },
  { name: "Next.js", role: "Web Demo", icon: "▲" },
];

const PIPELINE_STAGES = [
  { key: "M4", label: "Background Segregation" },
  { key: "M1", label: "Speaker Count Extraction" },
  { key: "M2", label: "Transcript Generation" },
];

export default function HomePage() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStage, setActiveStage] = useState(0);
  const [stageText, setStageText] = useState("");

  const handleDemoClick = () => {
    router.push("/results?demo=true");
  };

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsProcessing(true);
      setProgress(0);
      setActiveStage(0);
      setStageText("Uploading audio file...");

      try {
        // Animate progress through stages
        const advanceProgress = (target: number, stage: number, text: string) =>
          new Promise<void>((resolve) => {
            setActiveStage(stage);
            setStageText(text);
            const step = () => {
              setProgress((prev) => {
                if (prev >= target) {
                  resolve();
                  return target;
                }
                setTimeout(step, 80);
                return prev + 2;
              });
            };
            step();
          });

        await advanceProgress(15, 0, "Uploading audio file...");

        // Upload to our API route
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/diarize", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Processing failed" }));
          throw new Error(error.error || "Processing failed");
        }

        await advanceProgress(60, 1, "Analyzing speakers...");
        await advanceProgress(85, 2, "Generating transcript...");

        const result = await response.json();

        // Store result and navigate
        sessionStorage.setItem("rais_result", JSON.stringify(result));
        setProgress(100);
        setStageText("Complete!");

        setTimeout(() => {
          setIsProcessing(false);
          router.push("/results");
        }, 500);
      } catch (error: unknown) {
        setIsProcessing(false);
        const message = error instanceof Error ? error.message : "Processing failed";
        alert(`Error: ${message}\n\nTry the demo mode instead!`);
      }
    },
    [router]
  );

  return (
    <>
      {isProcessing && (
        <ProcessingOverlay
          progress={progress}
          stage={stageText}
          stages={PIPELINE_STAGES}
          activeIndex={activeStage}
        />
      )}

      <Navbar />

      <main className="relative z-10">
        {/* ── Hero Section ──────────────────────────────────────────── */}
        <section className="pt-32 pb-16 px-6">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] mb-8">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-xs font-semibold text-[var(--color-on-surface-variant)] tracking-wide uppercase">
                Nura AI Labs — Hackathon Project
              </span>
            </div>

            {/* Waveform */}
            <div className="animate-fade-in-up delay-100 mb-6 flex justify-center">
              <div className="w-64">
                <Waveform barCount={24} color="#c0c1ff" height={64} />
              </div>
            </div>

            {/* Title */}
            <h1 className="animate-fade-in-up delay-200 text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight mb-4">
              Real-Time Audio
              <br />
              <span className="bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                Intelligence System
              </span>
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in-up delay-300 text-lg text-[var(--color-on-surface-variant)] max-w-2xl mx-auto leading-relaxed mb-10">
              Upload audio or start live listening — uncover every voice,
              classify background sounds, and analyze spatial context with
              AI-powered speaker diarization.
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up delay-400 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={handleDemoClick} className="btn-primary text-lg px-8 py-4">
                <span>📊</span>
                Try Live Demo
              </button>
              <a href="#upload" className="btn-secondary text-lg px-8 py-4">
                <span>📁</span>
                Upload Your Audio
              </a>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section id="features" className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">
                Intelligent Audio Analysis
              </h2>
              <p className="text-[var(--color-on-surface-variant)] max-w-xl mx-auto">
                Beyond simple transcription — we understand who is speaking,
                what is being said, and what sounds surround the conversation.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURES.map((feature, i) => (
                <div
                  key={feature.title}
                  className="glass-panel glass-panel-hover p-6 animate-fade-in-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${feature.color}12` }}
                  >
                    <span className="text-2xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Demo / Upload Section ────────────────────────────────── */}
        <section id="demo" className="py-20 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">
                See It In Action
              </h2>
              <p className="text-[var(--color-on-surface-variant)]">
                Try the demo with a pre-analyzed meeting recording, or upload your own audio file.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Demo Card */}
              <button
                onClick={handleDemoClick}
                className="glass-panel glass-panel-hover p-8 text-left group cursor-pointer border-0"
              >
                <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-5 group-hover:shadow-lg group-hover:shadow-indigo-500/20 transition-shadow">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Try Demo Results
                </h3>
                <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed mb-4">
                  Explore a pre-analyzed 3-speaker team meeting with full
                  transcript, speaker recognition, and sound classification.
                </p>
                <span className="text-sm font-semibold text-[var(--color-primary)] flex items-center gap-1 group-hover:gap-2 transition-all">
                  View Demo →
                </span>
              </button>

              {/* Live Card */}
              <div className="glass-panel p-8 text-left relative overflow-hidden">
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-error)] animate-pulse" />
                  <span className="text-[10px] font-bold text-[var(--color-error)] uppercase tracking-wider">
                    Live
                  </span>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-[var(--color-error)]/10 flex items-center justify-center mb-5">
                  <span className="text-2xl">🎤</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Live Listening
                </h3>
                <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed mb-4">
                  Real-time speaker diarization and sound classification via
                  the mobile app — available on React Native (Expo).
                </p>
                <span className="text-sm font-semibold text-[var(--color-on-surface-variant)]">
                  Mobile App Only
                </span>
              </div>
            </div>

            {/* Upload Zone */}
            <div id="upload">
              <AudioUploader
                onFileSelect={handleFileSelect}
                disabled={isProcessing}
              />
            </div>
          </div>
        </section>

        {/* ── Tech Stack ───────────────────────────────────────────── */}
        <section id="tech" className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">
                Technology Stack
              </h2>
              <p className="text-[var(--color-on-surface-variant)]">
                Built with cutting-edge AI and modern web technologies.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {TECH_STACK.map((tech, i) => (
                <div
                  key={tech.name}
                  className="glass-panel glass-panel-hover p-5 text-center animate-fade-in-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="text-2xl block mb-2">{tech.icon}</span>
                  <p className="text-sm font-semibold text-white">
                    {tech.name}
                  </p>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-1">
                    {tech.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pipeline ─────────────────────────────────────────────── */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">
                Processing Pipeline
              </h2>
              <p className="text-[var(--color-on-surface-variant)]">
                8 milestones delivering end-to-end audio intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: "M1",
                  title: "Speaker Count",
                  desc: "Detect the number of unique speakers using AI diarization",
                  color: "#6366F1",
                },
                {
                  key: "M2",
                  title: "Speaker Transcript",
                  desc: "Generate speaker-attributed, timestamped transcripts",
                  color: "#06B6D4",
                },
                {
                  key: "M3",
                  title: "Speaker Recognition",
                  desc: "Match speakers against registered voice profiles",
                  color: "#10B981",
                },
                {
                  key: "M4",
                  title: "Sound Segregation",
                  desc: "Separate speech from background noise using source separation",
                  color: "#8B5CF6",
                },
                {
                  key: "M5",
                  title: "Sound Classification",
                  desc: "Categorize environmental sounds into 5 groups",
                  color: "#F59E0B",
                },
                {
                  key: "M6",
                  title: "Distance Estimation",
                  desc: "Estimate Near/Mid/Far distance of each sound source",
                  color: "#EC4899",
                },
                {
                  key: "M7",
                  title: "Intensity Analysis",
                  desc: "Measure loudness levels of individual sound events",
                  color: "#EF4444",
                },
                {
                  key: "M8",
                  title: "Live Streaming",
                  desc: "Real-time pipeline via WebSocket with <3s latency",
                  color: "#3B82F6",
                },
              ].map((milestone, i) => (
                <div
                  key={milestone.key}
                  className="glass-panel glass-panel-hover p-5 flex items-start gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{
                      backgroundColor: `${milestone.color}15`,
                      color: milestone.color,
                    }}
                  >
                    {milestone.key}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">
                      {milestone.title}
                    </h4>
                    <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed">
                      {milestone.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className="border-t border-white/[0.07] py-10 px-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-white text-xs font-bold">R</span>
              </div>
              <span className="text-sm text-[var(--color-on-surface-variant)]">
                RAIS — Built at Nura AI Labs Hackathon
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/Melvin-1117/RAIS-nura"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-on-surface-variant)] hover:text-white transition-colors"
              >
                GitHub Repository
              </a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
