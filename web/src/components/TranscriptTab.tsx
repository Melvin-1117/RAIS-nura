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

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptTab({ result }: { result: DemoResult }) {
  const speakerIndex: Record<string, number> = {};
  result.speaker_labels.forEach((s, i) => (speakerIndex[s] = i));

  const matchByLabel: Record<string, { display_name: string }> = {};
  for (const match of result.speaker_matches) {
    matchByLabel[match.speaker] = match;
  }

  const entries = [...result.utterances].sort((a, b) => a.start - b.start);

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const idx = speakerIndex[entry.speaker] ?? 0;
        const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
        const display =
          matchByLabel[entry.speaker]?.display_name || entry.speaker;

        return (
          <div
            key={i}
            className="glass-panel p-4 animate-fade-in-up"
            style={{
              borderLeft: `3px solid ${color}`,
              animationDelay: `${Math.min(i * 50, 500)}ms`,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{
                  color,
                  backgroundColor: `${color}15`,
                }}
              >
                {display}
              </span>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] font-mono">
                {formatTimestamp(entry.start)}
              </span>
            </div>
            <p className="text-sm text-[var(--color-on-surface)] leading-relaxed">
              {entry.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
