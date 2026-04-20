import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../constants/theme';

const distanceConfig = {
  Near: { color: theme.accentGreen, label: 'Near' },
  Mid: { color: theme.warning, label: 'Mid' },
  Far: { color: theme.danger, label: 'Far' },
};

type DistanceBadgeProps = {
  distance: 'Near' | 'Mid' | 'Far';
};

export const DistanceBadge = ({ distance }: DistanceBadgeProps) => {
  const config = distanceConfig[distance];

  return (
    <View style={[styles.badge, { borderColor: `${config.color}40`, backgroundColor: `${config.color}15` }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
