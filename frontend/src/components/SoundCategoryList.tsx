import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ALL_CATEGORIES,
  CategorizedSoundEvents,
  SoundCategory,
} from '../types/soundCategories';
import { SoundCategoryCard } from './SoundCategoryCard';
import { SoundCategoryListSkeleton } from './SoundCategoryListSkeleton';

import { theme } from '../constants/theme';

interface SoundCategoryListProps {
  soundEvents: CategorizedSoundEvents | null;
  isLoading: boolean;
}

export function SoundCategoryList({ soundEvents, isLoading }: SoundCategoryListProps) {
  const [expandedCategory, setExpandedCategory] = useState<SoundCategory | null>(null);

  const handleToggle = (category: SoundCategory) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  };

  if (isLoading) {
    return <SoundCategoryListSkeleton />;
  }

  if (!soundEvents) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No sound analysis available</Text>
      </View>
    );
  }

  return (
    <View>
      {ALL_CATEGORIES.map((category) => (
        <SoundCategoryCard
          key={category}
          category={category}
          events={soundEvents.byCategory[category] ?? []}
          isExpanded={expandedCategory === category}
          onToggleExpand={() => handleToggle(category)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
  },
});
