"use client";

import { useState } from "react";
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

const DISTANCE_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: string }
> = {
  Near: {
    label: "Near (<1m)",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: "🎯",
  },
  Mid: {
    label: "Mid (1–5m)",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: "📍",
  },
  Far: {
    label: "Far (>5m)",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    icon: "📡",
  },
};

const ALL_CATEGORIES = [
  "Natural",
  "Artificial",
  "Human Activity",
  "Music",
  "Animal",
];

export default function SoundsTab({ result }: { result: DemoResult }) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Natural: true,
    Artificial: true,
    "Human Activity": true,
    Music: true,
    Animal: true,
  });

  // FRONTEND REQUIREMENT 4: Respect separation-gating behavior from M4
  const separationConfirmed = result?.processing?.separation_confirmed ?? true;
  if (!separationConfirmed) {
    return (
      <div className="glass-panel p-8 text-center animate-fade-in-up">
        <span className="text-4xl block mb-3">⚠️</span>
        <h3 className="text-lg font-semibold text-white mb-2">
          Background analysis unavailable for this recording
        </h3>
        <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto">
          Sound separation was disabled or did not run successfully for this session. Audio intelligence metrics could not isolate background components.
        </p>
      </div>
    );
  }

  const allEvents = result?.sounds ?? [];

  // "Unknown Sound" / unclassified events in separate section
  const unclassifiedEvents = allEvents.filter(
    (s) => s.label === "Unknown Sound" || s.category === "Unclassified" || !s.category
  );

  const categorizedEvents = allEvents.filter(
    (s) => s.label !== "Unknown Sound" && s.category && s.category !== "Unclassified"
  );

  // Group sounds by the 5 main categories
  const byCategory: Record<string, typeof allEvents> = {};
  for (const cat of ALL_CATEGORIES) byCategory[cat] = [];
  for (const sound of categorizedEvents) {
    const cat = sound.category || "Artificial";
    if (byCategory[cat]) byCategory[cat].push(sound);
  }

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-6">
      {/* EDGE CASE: Zero background sounds detected */}
      {allEvents.length === 0 && (
        <div className="glass-panel p-6 text-center animate-fade-in-up">
          <span className="text-3xl block mb-2">🔇</span>
          <h4 className="text-base font-semibold text-white">No background sounds detected</h4>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
            Audio stream is clean or near-silent without identifiable background noise events.
          </p>
        </div>
      )}

      {/* 5 Category Cards */}
      <div className="space-y-4">
        {ALL_CATEGORIES.map((cat) => {
          const events = byCategory[cat] ?? [];
          const config = CATEGORY_CONFIG[cat] ?? { icon: "🔉", color: "#c0c1ff" };
          const hasEvents = events.length > 0;
          const isExpanded = expandedCategories[cat] ?? false;

          return (
            <div
              key={cat}
              className="glass-panel p-4 animate-fade-in-up border-l-4 transition-all"
              style={{ borderLeftColor: config.color }}
            >
              {/* Category Card Header */}
              <div
                onClick={() => toggleCategory(cat)}
                className={`flex items-center justify-between cursor-pointer select-none ${
                  hasEvents ? "mb-2" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: config.color }} className="text-lg">
                    {config.icon}
                  </span>
                  <h4 className="text-base font-semibold text-white">{cat}</h4>
                  {hasEvents ? (
                    <span className="text-xs font-bold text-[var(--color-on-surface-variant)] bg-white/10 px-2 py-0.5 rounded-full">
                      {events.length} {events.length === 1 ? "event" : "events"}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-on-surface-variant)] italic">
                      (0 events checked)
                    </span>
                  )}
                </div>

                <div className="text-xs text-[var(--color-on-surface-variant)]">
                  {hasEvents ? (isExpanded ? "▲" : "▼") : ""}
                </div>
              </div>

              {/* Zero-event state inside category card */}
              {!hasEvents && (
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-1 pl-7">
                  No {cat.toLowerCase()} sounds detected in this recording
                </p>
              )}

              {/* Event list inside expanded category card */}
              {hasEvents && isExpanded && (
                <div className="space-y-3 mt-3 pt-3 border-t border-white/10">
                  {events.map((event, i) => {
                    const intensityPct = Math.round((event.confidence ?? 0.8) * 100);
                    const intensityLabel =
                      event.intensity || (intensityPct > 60 ? "High" : intensityPct > 30 ? "Medium" : "Low");
                    const intensityColor =
                      intensityLabel === "High"
                        ? "#ffb4ab"
                        : intensityLabel === "Medium"
                          ? "#F59E0B"
                          : "#4edea3";

                    const distTier = event.distance || "Mid";
                    const distInfo = DISTANCE_CONFIG[distTier] ?? DISTANCE_CONFIG["Mid"];

                    return (
                      <div
                        key={`${cat}-${i}`}
                        className="bg-white/5 rounded-xl p-3 border border-white/5"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-white capitalize">
                                {event.label}
                              </p>

                              {/* M6 FRONTEND REQUIREMENT: Distance badge with distinct visual treatment */}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${distInfo.badgeClass} flex items-center gap-1`}
                                title={
                                  event.distance_score !== undefined
                                    ? `Spatial Distance Score: ${event.distance_score}`
                                    : undefined
                                }
                              >
                                <span>{distInfo.icon}</span>
                                {distInfo.label}
                              </span>
                            </div>

                            <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                              {event.start.toFixed(1)}s - {event.end.toFixed(1)}s
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20">
                              {Math.round((event.confidence ?? 0) * 100)}% conf
                            </span>
                          </div>
                        </div>

                        {/* Intensity track */}
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-[9px] text-[var(--color-on-surface-variant)] font-bold uppercase tracking-wider">
                              Intensity
                            </span>
                            <span
                              className="text-[9px] font-bold"
                              style={{ color: intensityColor }}
                            >
                              {intensityLabel} ({intensityPct}%)
                            </span>
                          </div>
                          <div className="intensity-track h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="intensity-fill h-full rounded-full"
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
              )}
            </div>
          );
        })}
      </div>

      {/* "Unknown Sound" / Unclassified events in separate section */}
      {unclassifiedEvents.length > 0 && (
        <div className="glass-panel p-5 animate-fade-in-up border-l-4 border-gray-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">❓</span>
              <h4 className="text-base font-semibold text-white">Unknown Sounds</h4>
              <span className="text-xs font-bold text-gray-400 bg-white/10 px-2 py-0.5 rounded-full">
                {unclassifiedEvents.length} unclassified
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--color-on-surface-variant)] mb-3">
            Audio events with prediction confidence below the 40% threshold. Kept separate from main domain categories to keep counts precise.
          </p>

          <div className="space-y-3">
            {unclassifiedEvents.map((event, i) => {
              const distTier = event.distance || "Mid";
              const distInfo = DISTANCE_CONFIG[distTier] ?? DISTANCE_CONFIG["Mid"];

              return (
                <div
                  key={`unknown-${i}`}
                  className="bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-300">Unknown Sound</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${distInfo.badgeClass}`}>
                        {distInfo.icon} {distInfo.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                      {event.start.toFixed(1)}s - {event.end.toFixed(1)}s
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 bg-white/5 px-2 py-1 rounded-full">
                    {Math.round((event.confidence ?? 0) * 100)}% conf (&lt;40% threshold)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
