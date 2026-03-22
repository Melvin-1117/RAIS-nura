import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IntensityBar } from '../components/IntensityBar';
import { SoundCategoryList } from '../components/SoundCategoryList';
import { SpeakerTimeline } from '../components/SpeakerTimeline';
import { TranscriptBubble } from '../components/TranscriptBubble';
import { speakerPalette, theme } from '../constants/theme';
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

export const ResultsScreen = ({
  result,
  onGoHome,
  onOpenProfiles,
  onOpenSettings,
}: ResultsScreenProps) => {
  const [tab, setTab] = useState<TabKey>('Transcript');
  const transcriptScrollRef = useRef<ScrollView>(null);

  const transcriptEntries = useMemo(() => {
    const entries = result.utterances.length > 0
      ? result.utterances
      : result.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        speaker: segment.speaker,
        text: 'Speech detected in this segment.',
      }));

    const sorted = [...entries].sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return a.end - b.end;
    });

    // Keep each speaker turn separate so "who spoke what" remains explicit.
    return sorted;
  }, [result.segments, result.utterances]);

  useEffect(() => {
    if (tab !== 'Transcript') {
      return;
    }

    // Delay one tick to ensure content layout is available before scrolling.
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

    return ranked.map((item, idx) => {
      const share = item.duration / fullDuration;
      let activityCategory = 'Supporting';
      if (idx === 0 || share >= 0.45) {
        activityCategory = 'Dominant';
      } else if (share >= 0.2) {
        activityCategory = 'Active';
      }

      const match = speakerMatchByLabel[item.speaker];
      const knownCategory = match?.matched ? 'Known' : 'Unknown';
      const displayName =
        match?.display_name && match.display_name.toLowerCase() !== 'unknown'
          ? match.display_name
          : item.speaker;

      return {
        speaker: item.speaker,
        displayName,
        duration: item.duration,
        share,
        activityCategory,
        knownCategory,
      };
    });
  }, [result.processing.duration_seconds, result.segments, speakerMatchByLabel]);

  const categorizedSounds = useMemo((): CategorizedSoundEvents => {
    const byCategory = {} as Record<SoundCategory, CategorizedSoundEvents['frames']>;
    for (const cat of ALL_CATEGORIES) {
      byCategory[cat] = [];
    }
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

  const processingMode = useMemo(() => {
    const mode = result.processing.transcript_mode || 'unknown';
    const pretty = mode
      .replace(/_m\d+_m\d+/gi, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
    const diarizationRan = mode.toLowerCase().includes('pyannote');

    return {
      raw: mode,
      label: pretty,
      diarizationRan,
    };
  }, [result.processing.transcript_mode]);

  const overallIntensity = result.processing.overall_intensity ?? 'Low';
  const overallRmsLabel = (result.processing.overall_energy_rms ?? 0).toFixed(4);

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Results</Text>
        <View style={styles.topActions}>
          <Pressable onPress={onOpenProfiles} style={({ pressed }) => [styles.topActionBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.topActionText}>Profiles</Text>
          </Pressable>
          <Pressable onPress={onOpenSettings} style={({ pressed }) => [styles.topActionBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.topActionText}>Settings</Text>
          </Pressable>
          <Pressable onPress={onGoHome} style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.homeBtnText}>← Home</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{result.total_speakers}</Text>
          <Text style={styles.statLbl}>Speakers</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{transcriptEntries.length}</Text>
          <Text style={styles.statLbl}>Utterances</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{result.processing.duration_seconds}s</Text>
          <Text style={styles.statLbl}>Duration</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: theme.accentGreen }]}>Done</Text>
          <Text style={styles.statLbl}>Status</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.modeBar}>
        <Text style={styles.modePrefix}>Pipeline</Text>
        <View style={[styles.modeBadge, processingMode.diarizationRan ? styles.modeBadgeOk : styles.modeBadgeWarn]}>
          <Text style={[styles.modeBadgeText, processingMode.diarizationRan ? styles.modeBadgeTextOk : styles.modeBadgeTextWarn]}>
            {processingMode.label}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={transcriptScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TRANSCRIPT */}
        {tab === 'Transcript' && (
          transcriptEntries.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>No transcript data.</Text></View>
          ) : (
            transcriptEntries.map((utterance, index) => (
              <TranscriptBubble
                key={`${utterance.speaker}-${utterance.start}-${index}`}
                utterance={utterance}
                speakerIndex={speakerIndexMap[utterance.speaker] ?? 0}
              />
            ))
          )
        )}

        {/* SPEAKERS */}
        {tab === 'Speakers' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Detected Speakers</Text>
              <View style={styles.speakerChips}>
                {result.speaker_labels.map((label, index) => {
                  const color = speakerPalette[index % speakerPalette.length];
                  const match = speakerMatchByLabel[label];
                  const title =
                    match?.display_name && match.display_name.toLowerCase() !== 'unknown'
                      ? match.display_name
                      : label;
                  const confidence = Math.round((match?.confidence ?? 0) * 100);
                  return (
                    <View key={label} style={[styles.speakerChip, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}>
                      <View style={[styles.speakerDot, { backgroundColor: color }]} />
                      <Text style={[styles.speakerLabel, { color }]}>{title}</Text>
                      <Text style={styles.speakerConfidence}>{confidence}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Speaker Categorization</Text>
              {speakerInsights.map((item, index) => {
                const color = speakerPalette[index % speakerPalette.length];
                return (
                  <View key={item.speaker} style={styles.categoryRow}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.speakerDot, { backgroundColor: color }]} />
                      <Text style={styles.categoryName}>{item.displayName}</Text>
                    </View>
                    <View style={styles.categoryTags}>
                      <Text style={styles.categoryTag}>{item.activityCategory}</Text>
                      <Text style={styles.categoryTag}>{item.knownCategory}</Text>
                      <Text style={styles.categoryShare}>{Math.round(item.share * 100)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <SpeakerTimeline segments={result.segments} />
          </View>
        )}

        {tab === 'Sounds' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Background Separation</Text>
              <Text style={styles.metaText}>
                {result.processing.separation_confirmed ? 'Speech and background streams separated.' : 'Separation fallback mode.'}
              </Text>
              <Text style={styles.metaText}>
                Speech ratio: {Math.round((result.processing.speech_energy_ratio ?? 0) * 100)}% · Background ratio: {Math.round((result.processing.background_energy_ratio ?? 0) * 100)}%
              </Text>
            </View>

            <SoundCategoryList
              soundEvents={categorizedSounds}
              isLoading={false}
            />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Intensity Overview</Text>
              <IntensityBar
                label={`Overall Audio (RMS ${overallRmsLabel})`}
                intensity={overallIntensity}
              />
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  screenTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '700' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topActionBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.border,
  },
  topActionText: { color: theme.textMuted, fontSize: 12, fontWeight: '500' },
  homeBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  homeBtnText: { color: theme.accent, fontSize: 13, fontWeight: '500' },

  // Stats
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center', gap: 3 },
  statVal: { color: theme.textPrimary, fontSize: 20, fontWeight: '700' },
  statLbl: { color: theme.textMuted, fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  statSep: { width: 1, height: 28, backgroundColor: theme.border },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.background,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabBtnActive: { borderBottomColor: theme.accent },
  tabText: { color: theme.textMuted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: theme.textPrimary, fontWeight: '600' },

  modeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.background,
  },
  modePrefix: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeBadge: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  modeBadgeOk: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  modeBadgeWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modeBadgeTextOk: { color: '#22C55E' },
  modeBadgeTextWarn: { color: '#F59E0B' },

  // Content
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },

  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 14,
    letterSpacing: 0.2,
  },

  speakerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speakerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: theme.radius.pill, borderWidth: 1,
  },
  speakerDot: { width: 7, height: 7, borderRadius: 4 },
  speakerLabel: { fontWeight: '600', fontSize: 13 },
  speakerConfidence: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTag: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: theme.surface,
  },
  categoryShare: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
  },

  metaText: {
    color: theme.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },

  empty: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 36,
    alignItems: 'center',
  },
  emptyText: { color: theme.textMuted, fontSize: 14 },
});
