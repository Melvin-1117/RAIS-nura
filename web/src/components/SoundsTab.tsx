"use client";

import type { DemoResult } from "@/lib/demo-data";

const CATEGORY_CONFIG: Record<
  string,
  { icon: string; color: string }
> = {
  Natural: { icon: "🌿", color: "#4edea3" },
  Artificial: { icon: "⚙️", color: "#4cd7f6" },
  "Human Activity": { icon: "🤧", color: "#ffb4ab" },
  Music: { icon: "🎵", color: "#F59E0B" },
  Animal: { icon: "🐾", color: "#4edea3" },
};

const ALL_CATEGORIES = [
  "Natural",
  "Artificial",
  "Human Activity",
  "Music",
  "Animal",
];

export default function SoundsTab({ result }: { result: DemoResult }) {
  // Group sounds by category
  const byCategory: Record<string, typeof result.sounds> = {};
  for (const cat of ALL_CATEGORIES) byCategory[cat] = [];
  for (const sound of result.sounds) {
    const cat = sound.category || "Artificial";
    if (byCategory[cat]) byCategory[cat].push(sound);
  }

  return (
    <div className="space-y-6">
      {ALL_CATEGORIES.map((cat) => {
        const events = byCategory[cat];
        if (!events || events.length === 0) return null;
        const config = CATEGORY_CONFIG[cat] ?? {
          icon: "🔉",
          color: "#c0c1ff",
        };

        return (
          <div key={cat} className="space-y-3 animate-fade-in-up">
            {/* Category Header */}
            <div className="flex items-center gap-2">
              <span style={{ color: config.color }} className="text-lg">
                {config.icon}
              </span>
              <h4 className="text-base font-semibold text-white">{cat}</h4>
              <span className="text-xs text-[var(--color-on-surface-variant)] ml-1">
                ({events.length})
              </span>
            </div>

            {/* Sound Cards */}
            {events.map((event, i) => {
              const intensityPct = Math.round(event.confidence * 100);
              const intensityLabel =
                event.intensity || (intensityPct > 60 ? "High" : intensityPct > 30 ? "Medium" : "Low");
              const intensityColor =
                intensityLabel === "High"
                  ? "#ffb4ab"
                  : intensityLabel === "Medium"
                    ? "#F59E0B"
                    : "#4edea3";

              return (
                <div key={`${cat}-${i}`} className="glass-panel p-4">
                  {/* Sound Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${config.color}10` }}
                      >
                        <span style={{ color: config.color }}>
                          {config.icon}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {event.label}
                        </p>
                        <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                          {event.start.toFixed(1)}s - {event.end.toFixed(1)}s
                        </p>
                      </div>
                    </div>

                    {/* Distance Badge */}
                    <span className="text-[10px] font-bold text-[var(--color-on-surface-variant)] bg-white/5 px-2 py-1 rounded-full">
                      📍 {event.distance}
                    </span>
                  </div>

                  {/* Intensity Bar */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider">
                        Intensity
                      </span>
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: intensityColor }}
                      >
                        {intensityLabel} ({intensityPct}%)
                      </span>
                    </div>
                    <div className="intensity-track">
                      <div
                        className="intensity-fill"
                        style={{
                          width: `${intensityPct}%`,
                          backgroundColor: intensityColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
