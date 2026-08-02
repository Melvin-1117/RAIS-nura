import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, getSpeakerColor, radius, spacing, theme, typography } from '../constants/theme';
import { Utterance } from '../types/diarization';
import { formatHHMMSS } from '../utils/time';

type TranscriptBubbleProps = {
  utterance: Utterance;
  speakerIndex: number;
  speakerColor?: string;
  isTwoSpeakerMode?: boolean;
};

export const TranscriptBubble = ({
  utterance,
  speakerIndex,
  speakerColor,
  isTwoSpeakerMode = false,
}: TranscriptBubbleProps) => {
  const resolvedSpeakerName =
    utterance.speaker_name && utterance.speaker_name.toLowerCase() !== 'unknown speaker'
      ? utterance.speaker_name
      : utterance.speaker_display && utterance.speaker_display.toLowerCase() !== 'unknown'
      ? utterance.speaker_display
      : utterance.speaker;

  const isMatched =
    Boolean(utterance.speaker_name && utterance.speaker_name.toLowerCase() !== 'unknown speaker') ||
    Boolean(utterance.speaker_display && utterance.speaker_display.toLowerCase() !== 'unknown');

  // Visually distinguish Unknown Speaker with a neutral gray badge vs matched speaker color
  const UNKNOWN_NEUTRAL_COLOR = '#6B7280';
  const color = isMatched
    ? speakerColor || getSpeakerColor(resolvedSpeakerName)
    : UNKNOWN_NEUTRAL_COLOR;

  const rawConfidence = utterance.confidence ?? utterance.speaker_confidence ?? null;
  const confidencePercent =
    rawConfidence !== null && rawConfidence !== undefined && rawConfidence > 0
      ? Math.round(rawConfidence * (rawConfidence <= 1.0 ? 100 : 1))
      : null;

  const transcriptText = utterance.text?.trim() ?? '';
  const isRightAligned = isTwoSpeakerMode && speakerIndex % 2 === 1;

  return (
    <View
      style={[
        styles.container,
        isTwoSpeakerMode ? styles.twoSpeakerContainer : styles.fullWidthContainer,
        isRightAligned ? styles.alignRight : styles.alignLeft,
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            borderLeftColor: isRightAligned ? theme.border : color,
            borderRightColor: isRightAligned ? color : theme.border,
            borderLeftWidth: isRightAligned ? 1 : 3,
            borderRightWidth: isRightAligned ? 3 : 1,
          },
        ]}
      >
        {/* Header: Speaker Badge + Confidence Score */}
        <View style={styles.header}>
          <View
            style={[
              styles.speakerBadge,
              {
                backgroundColor: isMatched ? `${color}20` : 'rgba(107, 114, 128, 0.15)',
                borderColor: isMatched ? `${color}35` : 'rgba(107, 114, 128, 0.3)',
              },
            ]}
          >
            <Text style={[styles.speakerBadgeText, { color: isMatched ? color : '#9CA3AF' }]}>
              {isMatched ? resolvedSpeakerName : 'Unknown Speaker'}
            </Text>
          </View>

          {confidencePercent !== null && (
            <View style={styles.confidenceChip}>
              <Text style={styles.confidenceText}>{confidencePercent}% match</Text>
            </View>
          )}
        </View>

        {/* Transcribed Text */}
        {transcriptText ? (
          <Text style={styles.text}>{transcriptText}</Text>
        ) : (
          <Text style={styles.emptyText}>(no text recorded)</Text>
        )}

        {/* Timestamp formatted as HH:MM:SS */}
        <View style={styles.footer}>
          <Text style={styles.timeText}>
            ⏱️ {formatHHMMSS(utterance.start)} – {formatHHMMSS(utterance.end)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  fullWidthContainer: {
    width: '100%',
  },
  twoSpeakerContainer: {
    maxWidth: '85%',
  },
  alignLeft: {
    alignSelf: 'flex-start',
  },
  alignRight: {
    alignSelf: 'flex-end',
  },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: 8,
  },
  speakerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  speakerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  confidenceChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  confidenceText: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  text: {
    ...typography.bodyMd,
    color: colors.onSurface,
    lineHeight: 22,
    fontWeight: '400',
  },
  emptyText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 11,
    color: 'rgba(199, 196, 215, 0.6)',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
});
