import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { theme } from '../constants/theme';

type IntensityBarProps = {
  label: string;
  intensity: 'Low' | 'Medium' | 'High';
};

const intensityToPct = { Low: 28, Medium: 60, High: 90 };
const intensityToColor = {
  Low: theme.accentGreen,
  Medium: theme.warning,
  High: theme.danger,
};

export const IntensityBar = ({ label, intensity }: IntensityBarProps) => {
  const animWidth = useRef(new Animated.Value(0)).current;
  const targetPct = intensityToPct[intensity];

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: targetPct,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [targetPct, animWidth]);

  const animatedWidth = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.badge, { color: intensityToColor[intensity] }]}>{intensity}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, { width: animatedWidth, backgroundColor: intensityToColor[intensity] }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    opacity: 0.9,
  },
});
