import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DimensionValue } from 'react-native';

import { speakerPalette, theme } from '../constants/theme';
import { Segment } from '../types/diarization';
import { formatSeconds } from '../utils/time';

type SpeakerTimelineProps = {
  segments: Segment[];
};

export const SpeakerTimeline = ({ segments }: SpeakerTimelineProps) => {
  // Merge consecutive segments from the same speaker.
  const mergedSegments = useMemo(() => {
    const result: Segment[] = [];
    for (const seg of segments) {
      const last = result[result.length - 1];
      if (last && seg.speaker === last.speaker) {
        result[result.length - 1] = { ...last, end: Math.max(last.end, seg.end) };
      } else {
        result.push({ ...seg });
      }
    }
    return result;
  }, [segments]);

  const maxEnd = useMemo(
    () => Math.max(1, ...mergedSegments.map((segment) => segment.end)),
    [mergedSegments]
  );

  const speakerColors = useMemo(() => {
    const uniqueSpeakers = Array.from(new Set(mergedSegments.map((seg) => seg.speaker)));
    const colorMap: Record<string, string> = {};
    uniqueSpeakers.forEach((speaker, index) => {
      colorMap[speaker] = speakerPalette[index % speakerPalette.length];
    });
    return colorMap;
  }, [mergedSegments]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.heading}>Speaker Timeline</Text>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {mergedSegments.map((segment, index) => {
          const duration = Math.max(0.2, segment.end - segment.start);
          const widthPct: DimensionValue = `${Math.max(3, (duration / maxEnd) * 100)}%`;
          const color = speakerColors[segment.speaker] || speakerPalette[0];
          const label =
            segment.speaker_display && segment.speaker_display.toLowerCase() !== 'unknown'
              ? segment.speaker_display
              : segment.speaker;

          return (
            <View key={`${segment.speaker}-${segment.start}-${index}`} style={styles.row}>
              <View style={styles.rowMeta}>
                <View style={[styles.dot, { backgroundColor: color }]} />
                <Text style={styles.speakerLabel}>{label}</Text>
                <Text style={styles.timeLabel}>
                  {formatSeconds(segment.start)} – {formatSeconds(segment.end)}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: widthPct, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 14,
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
  },
  heading: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  scroll: {
    maxHeight: 280,
  },
  row: {
    marginBottom: 14,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  speakerLabel: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 13,
    flex: 1,
  },
  timeLabel: {
    color: theme.textMuted,
    fontSize: 11,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 4,
    opacity: 0.85,
  },
});
