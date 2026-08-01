import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { colors, radius, spacing, speakerPalette, typography } from '../constants/theme';
import { formatTimestamp } from '../utils/time';
import { DiarizationResponse } from '../types/diarization';
import { ALL_CATEGORIES, CategorizedSoundEvents, SoundCategory } from '../types/soundCategories';

type ResultsScreenProps = {
  result: DiarizationResponse;
  onGoHome: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

type TabKey = 'Transcript' | 'Speakers' | 'Sounds';
const tabs: TabKey[] = ['Transcript', 'Speakers', 'Sounds'];
const tabIcons: Record<TabKey, string> = { Transcript: '📝', Speakers: '👥', Sounds: '🔊' };

// ── Category display config ─────────────────────────────────────────────────
const categoryIcons: Record<string, string> = {
  Natural: '🌿',
  Artificial: '⚙️',
  'Human Activity': '🤧',
  Music: '🎵',
  Animal: '🐾',
};
const categoryIconColors: Record<string, string> = {
  Natural: colors.tertiary,
  Artificial: colors.secondary,
  'Human Activity': colors.error,
  Music: '#F59E0B',
  Animal: colors.tertiary,
};

export const ResultsScreen = ({
  result,
  onGoHome,
  onOpenProfiles,
  onOpenSettings,
}: ResultsScreenProps) => {
  const [tab, setTab] = useState<TabKey>('Transcript');
  const transcriptScrollRef = useRef<ScrollView>(null);

  // ── Derived data ──────────────────────────────────────────────────────────
  const transcriptEntries = useMemo(() => {
    const entries = result.utterances.length > 0
      ? result.utterances
      : result.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        speaker: segment.speaker,
        text: 'Speech detected in this segment.',
      }));
    return [...entries].sort((a, b) => a.start !== b.start ? a.start - b.start : a.end - b.end);
  }, [result.segments, result.utterances]);

  useEffect(() => {
    if (tab !== 'Transcript') return;
    const timer = setTimeout(() => {
      transcriptScrollRef.current?.scrollToEnd({ animated: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [tab, transcriptEntries]);

  const speakerIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    result.speaker_labels.forEach((speaker, index) => { map[speaker] = index; });
    return map;
  }, [result.speaker_labels]);

  const speakerMatchByLabel = useMemo(() => {
    const map: Record<string, { display_name: string; confidence: number; matched: boolean }> = {};
    for (const match of result.speaker_matches ?? []) {
      map[match.speaker] = match;
    }
    return map;
  }, [result.speaker_matches]);

  const speakerInsights = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const segment of result.segments) {
      const duration = Math.max(0, segment.end - segment.start);
      totals[segment.speaker] = (totals[segment.speaker] ?? 0) + duration;
    }
    const ranked = Object.entries(totals)
      .map(([speaker, duration]) => ({ speaker, duration }))
      .sort((a, b) => b.duration - a.duration);
    const fullDuration = Math.max(1, result.processing.duration_seconds || 1);
    return ranked.map((item) => {
      const share = item.duration / fullDuration;
      const match = speakerMatchByLabel[item.speaker];
      const displayName =
        match?.display_name && match.display_name.toLowerCase() !== 'unknown'
          ? match.display_name
          : item.speaker;
      return {
        speaker: item.speaker,
        displayName,
        duration: item.duration,
        share,
        confidence: match?.confidence ?? 0,
        matched: match?.matched ?? false,
      };
    });
  }, [result.processing.duration_seconds, result.segments, speakerMatchByLabel]);

  const categorizedSounds = useMemo((): CategorizedSoundEvents => {
    const byCategory = {} as Record<SoundCategory, CategorizedSoundEvents['frames']>;
    for (const cat of ALL_CATEGORIES) { byCategory[cat] = []; }
    for (const event of result.sounds) {
      const cat = (event.category as SoundCategory) || 'Artificial';
      if (byCategory[cat]) {
        byCategory[cat].push({
          label: event.label,
          score: event.confidence,
          startSec: event.start,
          endSec: event.end,
          category: cat,
        });
      }
    }
    return { frames: [], byCategory, summary: [] };
  }, [result.sounds]);

  const durationText = useMemo(() => {
    const s = result.processing.duration_seconds;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  }, [result.processing.duration_seconds]);

  const getSpeakerColor = (speaker: string) => {
    const idx = speakerIndexMap[speaker] ?? 0;
    return speakerPalette[idx % speakerPalette.length];
  };

  const handleNavigation = (navTab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (navTab === 'home') onGoHome();
    else if (navTab === 'profiles') onOpenProfiles();
    else if (navTab === 'settings') onOpenSettings();
  };

  return (
    <View style={styles.container}>
      {/* ── Header ────────────────────────────────────────── */}
      <TopAppBar
        variant="back"
        title="Analysis Complete"
        subtitle={`SESSION ID #${Math.floor(Math.random() * 9999)}`}
        onBack={onGoHome}
      />

      <ScrollView
        ref={tab === 'Transcript' ? transcriptScrollRef : undefined}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Stats Row ───────────────────────────────────── */}
        <View style={styles.statsRow}>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.primary }}>🎙️</Text>
            <Text style={styles.statValue}>{result.total_speakers}</Text>
            <Text style={styles.statLabel}>Speakers</Text>
          </GlassPanel>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.secondary }}>⏱️</Text>
            <Text style={styles.statValue}>{durationText}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </GlassPanel>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.tertiary }}>📊</Text>
            <Text style={styles.statValue}>{result.sounds.length}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </GlassPanel>
        </View>

        {/* ── Tab Bar ─────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {tabs.map((t) => {
            const isActive = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <Text style={{ fontSize: 14, marginRight: 4 }}>{tabIcons[t]}</Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {t}
                </Text>
                {isActive && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* ── Tab Content ─────────────────────────────────── */}
        {tab === 'Transcript' && (
          <View style={styles.tabContent}>
            {transcriptEntries.map((entry, i) => {
              const speakerColor = getSpeakerColor(entry.speaker);
              const display = speakerMatchByLabel[entry.speaker]?.display_name || entry.speaker;
              return (
                <GlassPanel key={i} style={[styles.transcriptBubble, { borderLeftWidth: 3, borderLeftColor: speakerColor }]}>
                  <View style={styles.bubbleHeader}>
                    <View style={[styles.speakerChip, { backgroundColor: `${speakerColor}15` }]}>
                      <Text style={[styles.speakerChipText, { color: speakerColor }]}>{display}</Text>
                    </View>
                    <Text style={styles.bubbleTime}>{formatTimestamp(entry.start)}</Text>
                  </View>
                  <Text style={styles.bubbleText}>{entry.text}</Text>
                </GlassPanel>
              );
            })}
          </View>
        )}

        {tab === 'Speakers' && (
          <View style={styles.tabContent}>
            {/* Engagement Timeline */}
            <View style={[styles.card, { padding: spacing.lg }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Engagement Timeline</Text>
                <Text style={styles.timeRange}>0:00 - {durationText}</Text>
              </View>
              <View style={styles.timelineBar}>
                {speakerInsights.map((s) => (
                  <View
                    key={s.speaker}
                    style={{
                      height: '100%',
                      width: `${Math.round(s.share * 100)}%`,
                      backgroundColor: getSpeakerColor(s.speaker),
                    }}
                  />
                ))}
              </View>
              <View style={styles.timelineLegend}>
                {speakerInsights.map((s) => (
                  <View key={s.speaker} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: getSpeakerColor(s.speaker) }]} />
                    <Text style={styles.legendText}>{s.displayName}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Speaker Cards */}
            {speakerInsights.map((s) => {
              const speakerColor = getSpeakerColor(s.speaker);
              return (
                <View key={s.speaker} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: speakerColor }]}>
                  <View style={styles.speakerCardRow}>
                    <View style={[styles.speakerAvatar, { backgroundColor: `${speakerColor}20`, borderColor: `${speakerColor}30` }]}>
                      <Text style={{ fontSize: 20 }}>👤</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.speakerName}>{s.displayName}</Text>
                        {s.matched && s.confidence > 0 && (
                          <View style={[styles.confidenceBadge, { backgroundColor: `${speakerColor}15`, borderColor: `${speakerColor}20` }]}>
                            <Text style={[styles.confidenceText, { color: speakerColor }]}>
                              {Math.round(s.confidence * 100)}% CONFIDENCE
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.speakerSubtext}>
                        {s.matched ? `Identified as ${s.displayName}` : 'Unknown Speaker'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.speakerDuration}>{Math.round(s.duration)}s</Text>
                      <Text style={[styles.speakerShare, { color: speakerColor }]}>
                        {Math.round(s.share * 100)}% SHARE
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {tab === 'Sounds' && (
          <View style={styles.tabContent}>
            {ALL_CATEGORIES.map((cat) => {
              const events = categorizedSounds.byCategory[cat];
              if (!events || events.length === 0) return null;
              return (
                <View key={cat} style={styles.soundCategory}>
                  <View style={styles.soundCategoryHeader}>
                    <Text style={{ fontSize: 16, color: categoryIconColors[cat] }}>{categoryIcons[cat] ?? '🔉'}</Text>
                    <Text style={styles.cardTitle}>{cat}</Text>
                  </View>
                  {events.map((event, i) => {
                    const intensity = Math.round(event.score * 100);
                    const intensityLabel = intensity > 60 ? 'High' : intensity > 30 ? 'Medium' : 'Low';
                    const intensityColor = intensity > 60 ? colors.error : intensity > 30 ? '#F59E0B' : colors.tertiary;
                    return (
                      <View key={`${cat}-${i}`} style={styles.soundCard}>
                        <View style={styles.soundCardHeader}>
                          <View style={styles.soundCardLeft}>
                            <View style={[styles.soundIconWrap, { backgroundColor: `${categoryIconColors[cat]}10` }]}>
                              <Text style={{ fontSize: 16, color: categoryIconColors[cat] }}>{categoryIcons[cat]}</Text>
                            </View>
                            <View>
                              <Text style={styles.soundName}>{event.label}</Text>
                              <Text style={styles.soundMeta}>
                                {event.startSec.toFixed(1)}s - {event.endSec.toFixed(1)}s
                              </Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.intensitySection}>
                          <View style={styles.intensityLabelRow}>
                            <Text style={styles.intensityLabelText}>INTENSITY</Text>
                            <Text style={[styles.intensityValueText, { color: intensityColor }]}>
                              {intensityLabel} ({intensity}%)
                            </Text>
                          </View>
                          <View style={styles.intensityTrack}>
                            <View style={[styles.intensityFill, { width: `${intensity}%`, backgroundColor: intensityColor }]} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Nav ─────────────────────────────────────── */}
      <BottomNavBar activeTab="home" onNavigate={handleNavigation} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 110 },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, padding: spacing.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statValue: { ...typography.headlineMd, color: colors.onSurface },
  statLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: spacing.md,
    gap: 4,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'relative',
  },
  tabItemActive: {
    backgroundColor: 'rgba(192, 193, 255, 0.1)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(192, 193, 255, 0.2)',
  },
  tabLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  tabLabelActive: { color: colors.primary },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: '25%',
    right: '25%',
    height: 3,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // Tab Content
  tabContent: { gap: spacing.md },

  // Card (shared)
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { ...typography.headlineMd, color: colors.onSurface },

  // Transcript
  transcriptBubble: { padding: spacing.md },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  speakerChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  speakerChipText: { ...typography.labelMd },
  bubbleTime: { ...typography.labelMd, color: 'rgba(199, 196, 215, 0.6)', fontFamily: 'monospace' },
  bubbleText: { ...typography.bodyMd, color: colors.onSurface, lineHeight: 22 },

  // Speakers — Timeline
  timeRange: { fontSize: 10, color: colors.onSurfaceVariant, fontFamily: 'monospace' },
  timelineBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHighest,
    marginBottom: spacing.md,
  },
  timelineLegend: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: colors.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Speaker Card
  speakerCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  speakerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerName: { ...typography.headlineMd, color: colors.onSurface },
  speakerSubtext: { ...typography.bodySm, color: colors.onSurfaceVariant },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  confidenceText: { fontSize: 10, fontWeight: '700' },
  speakerDuration: { ...typography.headlineMd, color: colors.onSurface },
  speakerShare: { fontSize: 10, fontWeight: '700' },

  // Sounds
  soundCategory: { gap: spacing.sm },
  soundCategoryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  soundCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  soundCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  soundCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  soundIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  soundName: { ...typography.bodyLg, color: colors.onSurface },
  soundMeta: { fontSize: 11, color: colors.onSurfaceVariant },
  intensitySection: { gap: 4 },
  intensityLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intensityLabelText: { fontSize: 10, color: colors.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase' },
  intensityValueText: { fontSize: 10, fontWeight: '700' },
  intensityTrack: { height: 6, backgroundColor: colors.surfaceContainerHighest, borderRadius: radius.pill, overflow: 'hidden' },
  intensityFill: { height: '100%', borderRadius: radius.pill },
});
