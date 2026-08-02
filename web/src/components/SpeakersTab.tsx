"use client";

import type { DemoResult } from "@/lib/demo-data";

const SPEAKER_COLORS = [
  "#6366F1",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#3B82F6",
  "#EF4444",
];

export default function SpeakersTab({ result }: { result: DemoResult }) {
  const speakerIndex: Record<string, number> = {};
  result.speaker_labels.forEach((s, i) => (speakerIndex[s] = i));

  const matchByLabel: Record<
    string,
    { display_name: string; confidence: number; matched: boolean }
  > = {};
  for (const match of result.speaker_matches) {
    matchByLabel[match.speaker] = match;
  }

  // Calculate speaking time per speaker
  const totals: Record<string, number> = {};
  for (const seg of result.segments) {
    const dur = Math.max(0, seg.end - seg.start);
    totals[seg.speaker] = (totals[seg.speaker] ?? 0) + dur;
  }

  const fullDuration = Math.max(1, result.processing.duration_seconds);
  const insights = Object.entries(totals)
    .map(([speaker, duration]) => ({
      speaker,
      duration,
      share: duration / fullDuration,
      ...(matchByLabel[speaker] ?? {
        display_name: speaker,
        confidence: 0,
        matched: false,
      }),
    }))
    .sort((a, b) => b.duration - a.duration);

  const durationText = (() => {
    const m = Math.floor(fullDuration / 60);
    const s = Math.round(fullDuration % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-4">
      {/* Engagement Timeline */}
      <div className="glass-panel p-5 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-white">
            Engagement Timeline
          </h4>
          <span className="text-xs text-[var(--color-on-surface-variant)] font-mono">
            0:00 - {durationText}
          </span>
        </div>

        {/* Timeline Bar */}
        <div className="h-3 rounded-full overflow-hidden bg-[var(--color-surface-container-highest)] flex mb-4">
          {insights.map((s) => {
            const idx = speakerIndex[s.speaker] ?? 0;
            const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
            return (
              <div
                key={s.speaker}
                style={{
                  width: `${Math.round(s.share * 100)}%`,
                  backgroundColor: color,
                }}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          {insights.map((s) => {
            const idx = speakerIndex[s.speaker] ?? 0;
            const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
            return (
              <div key={s.speaker} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider">
                  {s.display_name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Speaker Cards */}
      {insights.map((s, i) => {
        const idx = speakerIndex[s.speaker] ?? 0;
        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
        return (
          <div
            key={s.speaker}
            className="glass-panel p-5 animate-fade-in-up"
            style={{
              borderLeft: `4px solid ${color}`,
              animationDelay: `${(i + 1) * 100}ms`,
            }}
          >
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `${color}15`,
                  borderColor: `${color}30`,
                }}
              >
                <span className="text-xl">👤</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold text-white">
                    {s.display_name}
                  </span>
                  {s.matched && s.confidence > 0 && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      style={{
                        color,
                        backgroundColor: `${color}10`,
                        borderColor: `${color}20`,
                      }}
                    >
                      {Math.round(s.confidence * 100)}% CONFIDENCE
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--color-on-surface-variant)]">
                  {s.matched
                    ? `Identified as ${s.display_name}`
                    : "Unknown Speaker"}
                </span>
              </div>

              {/* Stats */}
              <div className="text-right shrink-0">
                <span className="text-lg font-semibold text-white">
                  {Math.round(s.duration)}s
                </span>
                <p
                  className="text-[10px] font-bold"
                  style={{ color }}
                >
                  {Math.round(s.share * 100)}% SHARE
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
