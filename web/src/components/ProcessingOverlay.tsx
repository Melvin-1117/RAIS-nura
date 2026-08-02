"use client";

interface ProcessingOverlayProps {
  progress: number;
  stage: string;
  stages: { key: string; label: string }[];
  activeIndex: number;
}

export default function ProcessingOverlay({
  progress,
  stage,
  stages,
  activeIndex,
}: ProcessingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#09090B]/90 backdrop-blur-xl flex items-center justify-center">
      <div className="w-full max-w-md mx-4 animate-fade-in-up">
        <div className="glass-panel p-8 space-y-6">
          {/* Spinner */}
          <div className="flex justify-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--color-surface-container-highest)]" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--color-primary)] animate-spin-slow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">🎙️</span>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="text-center">
            <h3 className="text-xl font-bold text-white mb-1">
              Analyzing Audio
            </h3>
            <p className="text-sm text-[var(--color-on-surface-variant)]">
              {stage}
            </p>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs font-semibold text-[var(--color-primary)]">
                {progress}% Complete
              </span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">
                {Math.max(0, Math.round((100 - progress) * 0.6))}s remaining
              </span>
            </div>
          </div>

          {/* Pipeline Steps */}
          <div className="space-y-2">
            {stages.map((s, i) => {
              const isDone = i < activeIndex;
              const isActive = i === activeIndex;
              return (
                <div
                  key={s.key}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    isDone
                      ? "bg-[#10B981]/5 border-[#10B981]/20"
                      : isActive
                        ? "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30"
                        : "bg-white/[0.02] border-white/[0.05] opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isDone ? (
                      <div className="w-7 h-7 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center">
                        <span className="text-[#10B981] text-xs font-bold">
                          ✓
                        </span>
                      </div>
                    ) : isActive ? (
                      <div className="w-7 h-7 rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] animate-spin-slow" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[var(--color-surface-container-highest)] border border-white/10 flex items-center justify-center">
                        <span className="text-[var(--color-on-surface-variant)] text-xs">
                          ⋯
                        </span>
                      </div>
                    )}
                    <span
                      className={`text-sm ${isDone ? "text-white" : isActive ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-on-surface-variant)]"}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold tracking-wider uppercase ${isDone ? "text-[#10B981]" : isActive ? "text-[var(--color-primary)]" : "text-[var(--color-on-surface-variant)]"}`}
                  >
                    {isDone ? "DONE" : isActive ? "RUNNING..." : "PENDING"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
