"use client";

import { useCallback, useRef, useState } from "react";

interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function AudioUploader({
  onFileSelect,
  disabled,
}: AudioUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("audio/")) {
        alert("Please upload an audio file (.mp3, .wav, .m4a, etc.)");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        alert("File too large. Please upload a file under 25MB.");
        return;
      }
      setSelectedFile(file);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-indigo)]/10 flex items-center justify-center">
            <span className="text-3xl">🎵</span>
          </div>

          <div>
            <p className="text-[var(--color-on-surface)] font-semibold text-base">
              Drop your audio file here
            </p>
            <p className="text-[var(--color-on-surface-variant)] text-xs mt-1">
              or click to browse • MP3, WAV, M4A up to 25MB
            </p>
          </div>
        </div>
      </div>

      {selectedFile && (
        <div className="glass-panel px-4 py-3 flex items-center gap-3">
          <span className="text-lg">🎵</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-on-surface)] font-medium truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile(null);
            }}
            className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[var(--color-on-surface-variant)] hover:bg-white/10 transition-colors text-sm"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
