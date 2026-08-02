"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  barCount?: number;
  color?: string;
  height?: number;
  animate?: boolean;
}

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
      const duration = (0.8 + Math.random() * 0.8).toFixed(2);
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
        const baseHeight = 20 + Math.sin(i * 0.5) * 30 + Math.random() * 30;
        return (
          <div
            key={i}
            className={animate ? "waveform-bar" : ""}
            style={{
              width: Math.max(2, Math.floor(200 / barCount)),
              height: `${baseHeight}%`,
              backgroundColor: color,
              borderRadius: 2,
              opacity: 0.6 + Math.random() * 0.4,
            }}
          />
        );
      })}
    </div>
  );
}
