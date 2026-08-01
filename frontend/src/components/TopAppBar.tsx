import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../constants/theme';

type TopAppBarProps = {
  /** 'logo' shows NURA branding; 'back' shows a back arrow + title */
  variant: 'logo' | 'back';
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
};

export const TopAppBar = ({ variant, title, subtitle, onBack, rightElement }: TopAppBarProps) => {
  return (
    <View style={styles.container}>
      {variant === 'logo' ? (
        <View style={styles.logoRow}>
          <Text style={styles.logoTitle}>NURA</Text>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        </View>
      ) : (
        <View style={styles.backRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
      )}
      <View style={styles.rightSection}>
        {rightElement}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceDim,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  aiBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiBadgeText: {
    color: '#6366F1',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: colors.primary,
  },
  title: {
    ...typography.headlineMd,
    color: colors.onSurface,
  },
  subtitle: {
    ...typography.labelMd,
    color: 'rgba(192, 193, 255, 0.7)',
    textTransform: 'uppercase',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
