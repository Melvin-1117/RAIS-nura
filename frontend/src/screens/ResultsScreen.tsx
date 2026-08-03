import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { TranscriptBubble } from '../components/TranscriptBubble';
import { colors, getSpeakerColor, radius, spacing, typography } from '../constants/theme';
import { DiarizationResponse, Utterance } from '../types/diarization';
import { ALL_CATEGORIES, CategorizedSoundEvents, SoundCategory } from '../types/soundCategories';

type ResultsScreenProps = {
  result?: DiarizationResponse;
  isLoading?: boolean;
  onGoHome: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

type TabKey = 'Transcript' | 'Speakers' | 'Sounds';
const tabs: TabKey[] = ['Transcript', 'Speakers', 'Sounds'];
const tabIcons: Record<TabKey, string> = { Transcript: '📝', Speakers: '👥', Sounds: '🔊' };

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

// ── Loading Skeleton ────────────────────────────────────────────────────────
const TranscriptSkeletonList = () => (
  <View style={styles.skeletonContainer}>
    {[0, 1, 2, 3].map((key) => (
      <View
        key={key}
        style={[
          styles.skeletonBubble,
          key % 2 === 1 ? styles.skeletonAlignRight : styles.skeletonAlignLeft,
        ]}
      >
        <View style={styles.skeletonBadge} />
        <View style={styles.skeletonTextLineLong} />
        <View style={styles.skeletonTextLineShort} />
      </View>
    ))}
  </View>
);

// ── Empty State ─────────────────────────────────────────────────────────────
const TranscriptEmptyState = () => (
  <GlassPanel style={styles.emptyCard}>
    <Text style={styles.emptyIcon}>🔇</Text>
    <Text style={styles.emptyTitle}>No speech detected</Text>
    <Text style={styles.emptySubtext}>
      No spoken words or voice segments were detected in this audio recording.
    </Text>
  </GlassPanel>
);

export const ResultsScreen = ({
  result,
  isLoading = false,
  onGoHome,
  onOpenProfiles,
  onOpenSettings,
}: ResultsScreenProps) => {
  const [tab, setTab] = useState<TabKey>('Transcript');
  const flatListRef = useRef<FlatList<Utterance>>(null);
  const hasScrolledRef = useRef(false);

  // ── Utterance entries ─────────────────────────────────────────────────────
  const transcriptEntries = useMemo(() => {
    if (!result) return [];
    const entries: Utterance[] =
      result.utterances && result.utterances.length > 0
        ? result.utterances
        : result.segments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            speaker: segment.speaker,
            speaker_display: segment.speaker_display,
            speaker_confidence: segment.speaker_confidence,
            text: 'Speech detected in this segment.',
          }));

    return [...entries].sort((a, b) => (a.start !== b.start ? a.start - b.start : a.end - b.end));
  }, [result]);

  // Auto-scroll to latest utterance when list first loads
  useEffect(() => {
    if (tab !== 'Transcript' || transcriptEntries.length === 0 || hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 200);
    return () => clearTimeout(timer);
  }, [tab, transcriptEntries]);

  const speakerIndexMap = useMemo(() => {
    if (!result) return {};
    const map: Record<string, number> = {};
    result.speaker_labels.forEach((speaker, index) => {
      map[speaker] = index;
    });
    return map;
  }, [result]);

  const isTwoSpeakerMode = useMemo(() => {
    if (!result) return false;
    const count = result.total_speakers || result.speaker_labels?.length || 0;
    return count === 2;
  }, [result]);

  const speakerMatchByLabel = useMemo(() => {
    if (!result) return {};
    const map: Record<string, { display_name: string; confidence: number; matched: boolean }> = {};
    for (const match of result.speaker_matches ?? []) {
      map[match.speaker] = match;
    }
    return map;
  }, [result]);

  const speakerInsights = useMemo(() => {
    if (!result) return [];
    const totals: Record<string, number> = {};
    for (const segment of result.segments) {
      const duration = Math.max(0, segment.end - segment.start);
      totals[segment.speaker] = (totals[segment.speaker] ?? 0) + duration;
    }
    const ranked = Object.entries(totals)
      .map(([speaker, duration]) => ({ speaker, duration }))
      .sort((a, b) => b.duration - a.duration);
    const fullDuration = Math.max(1, result.processing?.duration_seconds || 1);
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
  }, [result, speakerMatchByLabel]);

  const categorizedSounds = useMemo((): CategorizedSoundEvents => {
    if (!result) return { frames: [], byCategory: {} as any, summary: [] };
    const byCategory = {} as Record<SoundCategory, CategorizedSoundEvents['frames']>;
    for (const cat of ALL_CATEGORIES) {
      byCategory[cat] = [];
    }
    for (const event of result.sounds || []) {
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
  }, [result]);

  const durationText = useMemo(() => {
    if (!result) return '0m 0s';
    const s = result.processing?.duration_seconds || 0;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}m ${sec}s`;
  }, [result]);

  const handleNavigation = (navTab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (navTab === 'home') onGoHome();
    else if (navTab === 'profiles') onOpenProfiles();
    else if (navTab === 'settings') onOpenSettings();
  };

  const renderTranscriptItem = ({ item }: { item: Utterance }) => {
    const idx = speakerIndexMap[item.speaker] ?? 0;
    const speakerKey =
      item.speaker_name && item.speaker_name.toLowerCase() !== 'unknown speaker'
        ? item.speaker_name
        : item.speaker;
    const color = getSpeakerColor(speakerKey);
    return (
      <TranscriptBubble
        utterance={item}
        speakerIndex={idx}
        speakerColor={color}
        isTwoSpeakerMode={isTwoSpeakerMode}
      />
    );
  };


  return (
    <View style={styles.container}>
      {/* Header */}
      <TopAppBar
        variant="back"
        title="Analysis Complete"
        subtitle={`SESSION ID #${Math.floor(Math.random() * 9999)}`}
        onBack={onGoHome}
      />

      <View style={styles.mainContent}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.primary }}>🎙️</Text>
            <Text style={styles.statValue}>{result?.total_speakers ?? 0}</Text>
            <Text style={styles.statLabel}>Speakers</Text>
          </GlassPanel>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.secondary }}>⏱️</Text>
            <Text style={styles.statValue}>{durationText}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </GlassPanel>
          <GlassPanel style={styles.statCard}>
            <Text style={{ fontSize: 18, color: colors.tertiary }}>📊</Text>
            <Text style={styles.statValue}>{result?.sounds?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </GlassPanel>
        </View>

        {/* Tab Bar */}
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
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{t}</Text>
                {isActive && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* Tab Content */}
        {tab === 'Transcript' && (
          <View style={styles.transcriptTabWrapper}>
            {isLoading ? (
              <TranscriptSkeletonList />
            ) : transcriptEntries.length === 0 ? (
              <TranscriptEmptyState />
            ) : (
              <FlatList
                ref={flatListRef}
                data={transcriptEntries}
                renderItem={renderTranscriptItem}
                keyExtractor={(item, idx) => `${item.speaker}-${item.start}-${idx}`}
                contentContainerStyle={styles.flatListPadding}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {tab === 'Speakers' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: getSpeakerColor(s.speaker) },
                        ]}
                      />
                      <Text style={styles.legendText}>{s.displayName}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Speaker Cards */}
              {speakerInsights.map((s) => {
                const speakerColor = getSpeakerColor(s.speaker);
                return (
                  <View
                    key={s.speaker}
                    style={[styles.card, { borderLeftWidth: 4, borderLeftColor: speakerColor }]}
                  >
                    <View style={styles.speakerCardRow}>
                      <View
                        style={[
                          styles.speakerAvatar,
                          {
                            backgroundColor: `${speakerColor}20`,
                            borderColor: `${speakerColor}30`,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 20 }}>👤</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.speakerName}>{s.displayName}</Text>
                          {s.matched && s.confidence > 0 && (
                            <View
                              style={[
                                styles.confidenceBadge,
                                {
                                  backgroundColor: `${speakerColor}15`,
                                  borderColor: `${speakerColor}20`,
                                },
                              ]}
                            >
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
          </ScrollView>
        )}

        {tab === 'Sounds' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.tabContent}>
              {/* Separation gating */}
              {result?.processing?.separation_confirmed === false ? (
                <View style={styles.soundCard}>
                  <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 8 }}>⚠️</Text>
                  <Text style={[styles.cardTitle, { textAlign: 'center' }]}>
                    Background analysis unavailable for this recording
                  </Text>
                  <Text style={[styles.soundMeta, { textAlign: 'center', marginTop: 4 }]}>
                    Sound separation was not completed or failed for this recording session.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Empty state when zero sounds detected */}
                  {(!result?.sounds || result.sounds.length === 0) && (
                    <View style={styles.soundCard}>
                      <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 8 }}>🔇</Text>
                      <Text style={[styles.cardTitle, { textAlign: 'center' }]}>
                        No background sounds detected
                      </Text>
                      <Text style={[styles.soundMeta, { textAlign: 'center', marginTop: 4 }]}>
                        Audio stream is clean without distinct background events.
                      </Text>
                    </View>
                  )}

                  {/* 5 Main Category Cards */}
                  {ALL_CATEGORIES.map((cat) => {
                    const events = categorizedSounds.byCategory[cat] ?? [];
                    const hasEvents = events.length > 0;
                    return (
                      <View key={cat} style={styles.soundCategory}>
                        <View style={styles.soundCategoryHeader}>
                          <Text style={{ fontSize: 16, color: categoryIconColors[cat] }}>
                            {categoryIcons[cat] ?? '🔉'}
                          </Text>
                          <Text style={styles.cardTitle}>{cat}</Text>
                          <Text style={styles.soundMeta}>
                            ({hasEvents ? events.length : '0 events checked'})
                          </Text>
                        </View>

                        {!hasEvents ? (
                          <View style={[styles.soundCard, { opacity: 0.7 }]}>
                            <Text style={styles.soundMeta}>
                              No {cat.toLowerCase()} sounds detected
                            </Text>
                          </View>
                        ) : (
                          events.map((event, i) => {
                            const intensity = Math.round(event.score * 100);
                            const intensityLabel =
                              intensity > 60 ? 'High' : intensity > 30 ? 'Medium' : 'Low';
                            const intensityColor =
                              intensity > 60
                                ? colors.error
                                : intensity > 30
                                ? '#F59E0B'
                                : colors.tertiary;
                            return (
                              <View key={`${cat}-${i}`} style={styles.soundCard}>
                                <View style={styles.soundCardHeader}>
                                  <View style={styles.soundCardLeft}>
                                    <View
                                      style={[
                                        styles.soundIconWrap,
                                        { backgroundColor: `${categoryIconColors[cat]}10` },
                                      ]}
                                    >
                                      <Text style={{ fontSize: 16, color: categoryIconColors[cat] }}>
                                        {categoryIcons[cat]}
                                      </Text>
                                    </View>
                                    <View>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.soundName}>{event.label}</Text>
                                        <View
                                          style={{
                                            backgroundColor:
                                              event.distance === 'Near'
                                                ? 'rgba(78, 222, 163, 0.15)'
                                                : event.distance === 'Far'
                                                ? 'rgba(167, 139, 250, 0.15)'
                                                : 'rgba(245, 158, 11, 0.15)',
                                            borderColor:
                                              event.distance === 'Near'
                                                ? 'rgba(78, 222, 163, 0.3)'
                                                : event.distance === 'Far'
                                                ? 'rgba(167, 139, 250, 0.3)'
                                                : 'rgba(245, 158, 11, 0.3)',
                                            borderWidth: 1,
                                            borderRadius: 10,
                                            paddingHorizontal: 6,
                                            paddingVertical: 1,
                                          }}
                                        >
                                          <Text
                                            style={{
                                              fontSize: 9,
                                              fontWeight: '700',
                                              color:
                                                event.distance === 'Near'
                                                  ? '#4edea3'
                                                  : event.distance === 'Far'
                                                  ? '#a78bfa'
                                                  : '#F59E0B',
                                            }}
                                          >
                                            {event.distance === 'Near'
                                              ? '🎯 Near (<1m)'
                                              : event.distance === 'Far'
                                              ? '📡 Far (>5m)'
                                              : '📍 Mid (1–5m)'}
                                          </Text>
                                        </View>
                                      </View>
                                      <Text style={styles.soundMeta}>
                                        {event.startSec.toFixed(1)}s - {event.endSec.toFixed(1)}s
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                <View style={styles.intensitySection}>
                                  <View style={styles.intensityLabelRow}>
                                    <Text style={styles.intensityLabelText}>LOUDNESS INTENSITY</Text>
                                    <Text style={[styles.intensityValueText, { color: intensityColor }]}>
                                      {event.intensity || (intensity > 70 ? 'High' : intensity >= 30 ? 'Medium' : 'Low')} ({event.intensity_pct !== undefined && event.intensity_pct !== null ? event.intensity_pct.toFixed(1) : intensity}%)
                                    </Text>
                                  </View>
                                  <View style={styles.intensityTrack}>
                                    <View
                                      style={[
                                        styles.intensityFill,
                                        { width: `${Math.max(5, event.intensity_pct !== undefined && event.intensity_pct !== null ? event.intensity_pct : intensity)}%`, backgroundColor: intensityColor },
                                      ]}
                                    />
                                  </View>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    );
                  })}

                  {/* Unknown Sounds Section */}
                  {result?.sounds?.some(
                    (s) => s.label === 'Unknown Sound' || s.category === 'Unclassified' || !s.category
                  ) && (
                    <View style={styles.soundCategory}>
                      <View style={styles.soundCategoryHeader}>
                        <Text style={{ fontSize: 16 }}>❓</Text>
                        <Text style={styles.cardTitle}>Unknown Sounds</Text>
                      </View>
                      {result.sounds
                        .filter(
                          (s) => s.label === 'Unknown Sound' || s.category === 'Unclassified' || !s.category
                        )
                        .map((event, i) => (
                          <View key={`unknown-${i}`} style={styles.soundCard}>
                            <Text style={styles.soundName}>Unknown Sound</Text>
                            <Text style={styles.soundMeta}>
                              {event.start.toFixed(1)}s - {event.end.toFixed(1)}s (Confidence &lt; 40%)
                            </Text>
                          </View>
                        ))}
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Bottom Nav */}
      <BottomNavBar activeTab="home" onNavigate={handleNavigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mainContent: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  scroll: { paddingBottom: 110 },
  transcriptTabWrapper: { flex: 1 },
  flatListPadding: { paddingBottom: 110, gap: spacing.xs },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
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

  // Skeleton
  skeletonContainer: { gap: spacing.md, paddingVertical: spacing.sm },
  skeletonBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '85%',
    opacity: 0.6,
  },
  skeletonAlignLeft: { alignSelf: 'flex-start' },
  skeletonAlignRight: { alignSelf: 'flex-end' },
  skeletonBadge: { width: 70, height: 16, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  skeletonTextLineLong: { width: '90%', height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 8 },
  skeletonTextLineShort: { width: '50%', height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Empty State
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { ...typography.headlineMd, color: colors.onSurface, marginBottom: spacing.xs },
  emptySubtext: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center' },

  // Shared Card
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { ...typography.headlineMd, color: colors.onSurface },

  // Speakers Timeline
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
