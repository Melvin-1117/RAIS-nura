import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { theme } from '../constants/theme';
import {
  CATEGORY_COLORS,
  SoundCategory,
  SoundEventFrame,
} from '../types/soundCategories';

interface SoundCategoryCardProps {
  category: SoundCategory;
  events: SoundEventFrame[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SoundCategoryCard = ({
  category,
  events,
  isExpanded,
  onToggleExpand,
}: SoundCategoryCardProps) => {
  const color = CATEGORY_COLORS[category];
  const hasEvents = events.length > 0;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <TouchableOpacity
        onPress={hasEvents ? onToggleExpand : undefined}
        activeOpacity={hasEvents ? 0.7 : 1}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`${category} sounds, ${events.length} events, ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        <Text style={styles.categoryName}>{category}</Text>
        <View style={styles.headerRight}>
          {hasEvents && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </Text>
            </View>
          )}
          {hasEvents && (
            <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
          )}
        </View>
      </TouchableOpacity>

      {!hasEvents && (
        <Text style={styles.emptyText}>
          No {category.toLowerCase()} sounds detected
        </Text>
      )}

      {isExpanded && hasEvents && (
        <View style={styles.eventList}>
          {events.map((event, index) => (
            <View
              key={`${event.label}-${event.startSec}-${index}`}
              style={styles.eventRow}
            >
              <Text style={styles.eventLabel} numberOfLines={1}>
                {event.label}
              </Text>
              <View style={styles.timePill}>
                <Text style={styles.timeText}>
                  {formatTime(event.startSec)}–{formatTime(event.endSec)}
                </Text>
              </View>
              <View style={styles.confTrack}>
                <View
                  style={[
                    styles.confFill,
                    {
                      width: Math.round(event.score * 60),
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    borderLeftColor: '#555',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  chevron: {
    fontSize: 14,
    color: theme.textMuted,
  },
  emptyText: {
    fontSize: 13,
    color: theme.textMuted,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  eventList: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  eventLabel: {
    flex: 1,
    fontSize: 14,
    color: theme.textPrimary,
    textTransform: 'capitalize',
  },
  timePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    fontSize: 11,
    color: theme.textMuted,
    fontVariant: ['tabular-nums'],
  },
  confTrack: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
  },
  confFill: {
    height: 4,
    borderRadius: 2,
  },
});
