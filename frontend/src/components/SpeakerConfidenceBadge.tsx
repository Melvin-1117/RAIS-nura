import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../constants/theme';
import { MatchResult } from '../types/profiles';

type SpeakerConfidenceBadgeProps = {
  result: MatchResult;
};

export const SpeakerConfidenceBadge = ({ result }: SpeakerConfidenceBadgeProps) => {
  if (result.isUnknown || !result.profile) {
    return (
      <View style={[styles.badge, styles.unknown]}>
        <Text style={[styles.text, styles.unknownText]}>Unknown</Text>
      </View>
    );
  }

  const pct = `${Math.round(result.confidence * 100)}%`;
  const isHigh = result.confidence >= 0.85;

  return (
    <View style={[styles.badge, isHigh ? styles.high : styles.medium]}>
      <Text style={[styles.text, isHigh ? styles.highText : styles.mediumText]}>
        {result.profile.name} · {pct}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  unknown: {
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  unknownText: {
    color: theme.textMuted,
  },
  high: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  highText: {
    color: '#22C55E',
  },
  medium: {
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  mediumText: {
    color: '#F59E0B',
  },
});
