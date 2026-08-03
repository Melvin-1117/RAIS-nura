"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  barCount?: number;
  color?: string;
  height?: number;
  animate?: boolean;
}

// Deterministic pseudo-random generator based on index to prevent SSR/hydration mismatch
const getDeterministicValue = (index: number, seed = 12.9898) => {
  const val = Math.abs(Math.sin((index + 1) * seed));
  return val - Math.floor(val);
};

export default function Waveform({
  barCount = 32,
  color = "#c0c1ff",
  height = 80,
  animate = true,
}: WaveformProps) {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate || !barsRef.current) return;
    const bars = barsRef.current.children;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i] as HTMLElement;
      const delay = (i * 0.06).toFixed(2);
      const pseudoRandom = getDeterministicValue(i, 43.123);
      const duration = (0.8 + pseudoRandom * 0.8).toFixed(2);
      bar.style.animationDelay = `${delay}s`;
      bar.style.animationDuration = `${duration}s`;
    }
  }, [animate, barCount]);

  return (
    <div
      ref={barsRef}
      className="flex items-end justify-center gap-[3px]"
      style={{ height }}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const pseudoRandom = getDeterministicValue(i);
        const baseHeight = (20 + Math.sin(i * 0.5) * 30 + pseudoRandom * 30).toFixed(2);
        const opacity = (0.6 + pseudoRandom * 0.4).toFixed(2);

        return (
          <div
            key={i}
            className={animate ? "waveform-bar" : ""}
            style={{
              width: Math.max(2, Math.floor(200 / barCount)),
              height: `${baseHeight}%`,
              backgroundColor: color,
              borderRadius: 2,
              opacity: parseFloat(opacity),
            }}
          />
        );
      })}
    </div>
  );
}
