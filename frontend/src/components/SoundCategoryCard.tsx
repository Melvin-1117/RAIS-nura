import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../constants/theme';
import { DistanceBadge } from './DistanceBadge';

type SoundItem = {
  label: string;
  distance: 'Near' | 'Mid' | 'Far';
  intensity: 'Low' | 'Medium' | 'High';
  confidence: number;
};

type SoundCategoryCardProps = {
  category: string;
  items: SoundItem[];
};

const categoryIcons: Record<string, string> = {
  Natural: '🌿',
  Artificial: '⚙️',
  'Human Activity': '🎤',
  Music: '♪',
  Animal: '◈',
};

const intensityColors: Record<string, string> = {
  Low: theme.accentGreen,
  Medium: theme.warning,
  High: theme.danger,
};

export const SoundCategoryCard = ({ category, items }: SoundCategoryCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.categoryLabel}>{category}</Text>
        <Text style={styles.countBadge}>{items.length} sound{items.length !== 1 ? 's' : ''}</Text>
      </View>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.item}>
          <View style={styles.itemLeft}>
            <Text style={styles.label}>{item.label}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.intensityDot, { backgroundColor: intensityColors[item.intensity] ?? theme.textMuted }]} />
              <Text style={styles.meta}>{item.intensity} intensity</Text>
              <Text style={styles.separator}>·</Text>
              <Text style={styles.meta}>{Math.round(item.confidence * 100)}%</Text>
            </View>
          </View>
          <DistanceBadge distance={item.distance} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  categoryLabel: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  countBadge: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  itemLeft: {
    flex: 1,
  },
  label: {
    color: theme.textPrimary,
    fontWeight: '500',
    fontSize: 14,
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  intensityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  meta: {
    color: theme.textMuted,
    fontSize: 12,
  },
  separator: {
    color: theme.textMuted,
    fontSize: 12,
  },
});
