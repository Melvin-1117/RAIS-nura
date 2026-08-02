"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import TranscriptTab from "@/components/TranscriptTab";
import SpeakersTab from "@/components/SpeakersTab";
import SoundsTab from "@/components/SoundsTab";
import { DEMO_RESULT, type DemoResult } from "@/lib/demo-data";

type TabKey = "Transcript" | "Speakers" | "Sounds";
const TABS: TabKey[] = ["Transcript", "Speakers", "Sounds"];
const TAB_ICONS: Record<TabKey, string> = {
  Transcript: "📝",
  Speakers: "👥",
  Sounds: "🔊",
};

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<DemoResult | null>(null);
  const [tab, setTab] = useState<TabKey>("Transcript");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const demoParam = searchParams.get("demo");

    if (demoParam === "true") {
      setResult(DEMO_RESULT);
      setIsDemo(true);
      return;
    }

    // Try to load from sessionStorage
    const stored = sessionStorage.getItem("rais_result");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
        router.push("/");
      }
    } else {
      router.push("/");
    }
  }, [searchParams, router]);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin-slow w-12 h-12 rounded-full border-2 border-[var(--color-surface-container-highest)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  const durationText = (() => {
    const s = result.processing.duration_seconds;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  })();

  return (
    <>
      <Navbar />
      <main className="relative z-10 pt-20 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          {/* ── Header ────────────────────────────────────────────── */}
          <div className="mb-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => router.push("/")}
                className="text-[var(--color-on-surface-variant)] hover:text-white transition-colors text-sm flex items-center gap-1"
              >
                ← Back
              </button>
              {isDemo && (
                <span className="text-[10px] font-bold text-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10 px-2 py-0.5 rounded-full border border-[var(--color-accent-orange)]/20">
                  DEMO DATA
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Analysis Complete
            </h1>
            <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">
              {isDemo
                ? "Showing pre-analyzed team meeting results"
                : "Your audio has been processed"}
            </p>
          </div>

          {/* ── Stats Row ─────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4 mb-8 animate-fade-in-up delay-100">
            <div className="glass-panel p-5 text-center">
              <span className="text-lg block mb-1">🎙️</span>
              <span className="text-2xl font-bold text-white block">
                {result.total_speakers}
              </span>
              <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Speakers
              </span>
            </div>
            <div className="glass-panel p-5 text-center">
              <span className="text-lg block mb-1">⏱️</span>
              <span className="text-2xl font-bold text-white block">
                {durationText}
              </span>
              <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Duration
              </span>
            </div>
            <div className="glass-panel p-5 text-center">
              <span className="text-lg block mb-1">📊</span>
              <span className="text-2xl font-bold text-white block">
                {result.sounds.length}
              </span>
              <span className="text-[10px] font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
                Sound Events
              </span>
            </div>
          </div>

          {/* ── Source Separation Card ─────────────────────────────── */}
          {result.processing.separation_confirmed && (
            <div className="glass-panel p-5 mb-8 animate-fade-in-up delay-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">
                  Source Separation
                </h3>
                <span className="text-lg">📊</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                      Speech Energy
                    </span>
                    <span className="text-[10px] font-bold text-white">
                      {Math.round(
                        (result.processing.speech_energy_ratio ?? 0.82) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-4 rounded-lg overflow-hidden bg-[var(--color-surface-container-highest)] border border-white/5">
                    <div
                      className="h-full rounded-lg bg-[var(--color-primary)]"
                      style={{
                        width: `${Math.round((result.processing.speech_energy_ratio ?? 0.82) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-secondary)]">
                      Background Noise
                    </span>
                    <span className="text-[10px] font-bold text-white">
                      {Math.round(
                        (result.processing.background_energy_ratio ?? 0.18) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-4 rounded-lg overflow-hidden bg-[var(--color-surface-container-highest)] border border-white/5">
                    <div
                      className="h-full rounded-lg bg-[var(--color-secondary)]"
                      style={{
                        width: `${Math.round((result.processing.background_energy_ratio ?? 0.18) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Bar ───────────────────────────────────────────── */}
          <div className="flex border-b border-white/10 mb-6 animate-fade-in-up delay-300">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`tab-item ${t === tab ? "active" : ""}`}
              >
                <span>{TAB_ICONS[t]}</span>
                {t}
              </button>
            ))}
          </div>

          {/* ── Tab Content ───────────────────────────────────────── */}
          <div className="animate-fade-in delay-400">
            {tab === "Transcript" && <TranscriptTab result={result} />}
            {tab === "Speakers" && <SpeakersTab result={result} />}
            {tab === "Sounds" && <SoundsTab result={result} />}
          </div>

          {/* ── CTA ───────────────────────────────────────────────── */}
          <div className="mt-12 text-center">
            <button
              onClick={() => router.push("/")}
              className="btn-primary"
            >
              <span>🏠</span>
              Back to Home
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin-slow w-12 h-12 rounded-full border-2 border-[var(--color-surface-container-highest)] border-t-[var(--color-primary)]" />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
