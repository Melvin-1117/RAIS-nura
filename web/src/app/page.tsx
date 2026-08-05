"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Waveform from "@/components/Waveform";
import AudioUploader from "@/components/AudioUploader";
import ProcessingOverlay from "@/components/ProcessingOverlay";

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
      setProgress(5);
      setActiveStage(0);
      setStageText("Uploading audio file...");

      // Dynamic progress ticker while backend processes
      let currentProgress = 5;
      const progressTimer = setInterval(() => {
        currentProgress += 1;
        if (currentProgress > 92) {
          currentProgress = 92; // cap at 92% until request completes
        }

        // Update stage indicators based on progress percentage
        if (currentProgress < 30) {
          setActiveStage(0);
          setStageText("Uploading & separating audio...");
        } else if (currentProgress < 70) {
          setActiveStage(1);
          setStageText("Extracting unique speakers (Pyannote)...");
        } else {
          setActiveStage(2);
          setStageText("Generating transcript (Faster-Whisper)...");
        }

        setProgress(currentProgress);
      }, 250);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/diarize", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressTimer);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Processing failed" }));
          throw new Error(error.error || "Processing failed");
        }

        const result = await response.json();

        // Finish progress
        setProgress(100);
        setActiveStage(2);
        setStageText("Analysis Complete!");

        sessionStorage.setItem("rais_result", JSON.stringify(result));

        setTimeout(() => {
          setIsProcessing(false);
          router.push("/results");
        }, 400);
      } catch (error: unknown) {
        clearInterval(progressTimer);
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

      <main className="relative z-10 min-h-screen flex flex-col justify-between pt-24 pb-12">
        <section className="px-6 my-auto">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/10 bg-white/[0.03] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] tracking-wide uppercase">
                Nura AI Labs • Audio Intelligence
              </span>
            </div>

            {/* Waveform */}
            <div className="animate-fade-in-up delay-100 mb-5 flex justify-center">
              <div className="w-56">
                <Waveform barCount={20} color="#c0c1ff" height={52} />
              </div>
            </div>

            {/* Title */}
            <h1 className="animate-fade-in-up delay-200 text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-[1.15] mb-3">
              Real-Time Audio
              <br />
              <span className="bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                Intelligence System
              </span>
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in-up delay-300 text-xs sm:text-sm text-[var(--color-on-surface-variant)] max-w-lg mx-auto leading-relaxed mb-10">
              Upload an audio file or explore demo results to analyze speakers, transcripts, background sounds, spatial distance, and intensity.
            </p>

            {/* Workspace: Live + Demo + Uploader */}
            <div className="animate-fade-in-up delay-400 max-w-2xl mx-auto space-y-4 text-left">
              {/* Quick Action: Start Live Listening */}
              <div className="glass-panel p-5 flex items-center justify-between gap-4 border border-[var(--color-primary)]/20 hover:border-[var(--color-primary)]/40 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0 relative">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffb4ab] absolute top-1 right-1 animate-pulse" />
                    <span className="text-lg">🎙️</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      Start Live Listening
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/20 uppercase">
                        Real-Time
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--color-on-surface-variant)]">
                      Stream browser mic audio to analyze speakers and sounds live (under 500ms)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/live")}
                  className="btn-primary shrink-0 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:opacity-90 font-medium"
                >
                  Listen Live →
                </button>
              </div>

              {/* Quick Action: Try Demo */}
              <div className="glass-panel p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
                    <span className="text-lg">📊</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Explore Pre-Analyzed Demo
                    </h3>
                    <p className="text-xs text-[var(--color-on-surface-variant)]">
                      Instant 3-speaker meeting transcript with sound classification
                    </p>
                  </div>
                </div>
                <button onClick={handleDemoClick} className="btn-primary shrink-0">
                  Try Demo →
                </button>
              </div>

              {/* Upload Zone */}
              <AudioUploader
                onFileSelect={handleFileSelect}
                disabled={isProcessing}
              />
            </div>
          </div>
        </section>

        {/* ── Minimal Footer ────────────────────────────────────────── */}
        <footer className="border-t border-white/[0.07] pt-6 px-6 mt-12">
          <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-[var(--color-on-surface-variant)]">
            <span>RAIS — Real-Time Audio Intelligence System</span>
            <a
              href="https://github.com/Melvin-1117/RAIS-nura"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </footer>
      </main>
    </>
  );
}
