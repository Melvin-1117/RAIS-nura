import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../constants/theme';

type SeparationStatusCardProps = {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  vocalsReady: boolean;
  backgroundReady: boolean;
};

const stageLabel = (stage: string): string => {
  const normalized = (stage || 'queued').replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const SeparationStatusCard = ({
  status,
  progress,
  stage,
  vocalsReady,
  backgroundReady,
}: SeparationStatusCardProps) => {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>M4 Background Segregation</Text>
        <Text style={styles.pct}>{clamped}%</Text>
      </View>

      <Text style={styles.stage}>Stage: {stageLabel(stage)}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%` }]} />
      </View>

      <View style={styles.streamRow}>
        <View style={[styles.streamBadge, vocalsReady ? styles.streamReady : styles.streamPending]}>
          <Text style={styles.streamText}>Vocals {vocalsReady ? 'ready' : 'pending'}</Text>
        </View>
        <View style={[styles.streamBadge, backgroundReady ? styles.streamReady : styles.streamPending]}>
          <Text style={styles.streamText}>Background {backgroundReady ? 'ready' : 'pending'}</Text>
        </View>
      </View>

      <Text style={styles.hint}>
        {status === 'completed'
          ? 'M2 will prefer the clean vocals stream.'
          : 'Preparing clean speech and background event timeline...'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginTop: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  pct: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stage: {
    color: theme.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.accent,
  },
  streamRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  streamBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  streamReady: {
    borderColor: theme.accentGreen,
    backgroundColor: `${theme.accentGreen}22`,
  },
  streamPending: {
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  streamText: {
    color: theme.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  hint: {
    marginTop: 8,
    color: theme.textMuted,
    fontSize: 11,
  },
});
