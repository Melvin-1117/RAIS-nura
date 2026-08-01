import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius } from '../constants/theme';

type GlassPanelProps = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export const GlassPanel = ({ children, style }: GlassPanelProps) => {
  return <View style={[styles.panel, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(24, 24, 28, 0.7)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
});
