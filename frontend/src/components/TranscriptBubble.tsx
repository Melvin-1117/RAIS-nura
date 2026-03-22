import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { speakerPalette, theme } from '../constants/theme';
import { Utterance } from '../types/diarization';
import { formatSeconds } from '../utils/time';

type TranscriptBubbleProps = {
  utterance: Utterance;
  speakerIndex: number;
};

export const TranscriptBubble = ({ utterance, speakerIndex }: TranscriptBubbleProps) => {
  const color = speakerPalette[speakerIndex % speakerPalette.length];
  const transcriptText = utterance.text?.trim() ?? '';
  const speakerText =
    utterance.speaker_display && utterance.speaker_display.toLowerCase() !== 'unknown'
      ? utterance.speaker_display
      : utterance.speaker;
  const confidence = Math.round((utterance.speaker_confidence ?? 0) * 100);

  return (
    <View style={styles.row}>
      {/* Colored speaker stripe */}
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.bubble}>
        <View style={styles.header}>
          <Text style={[styles.speaker, { color }]}>{speakerText}</Text>
          <Text style={styles.confidence}>{confidence}%</Text>
        </View>
        {transcriptText ? <Text style={styles.text}>{transcriptText}</Text> : null}
        <Text style={styles.time}>
          {formatSeconds(utterance.start)} – {formatSeconds(utterance.end)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 10,
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  stripe: {
    width: 3,
    borderTopLeftRadius: theme.radius.md,
    borderBottomLeftRadius: theme.radius.md,
  },
  bubble: {
    flex: 1,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  speaker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  confidence: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  time: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
  },
  text: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
  },
});
