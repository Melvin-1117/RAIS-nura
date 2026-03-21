import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpeakerTimeline } from '../components/SpeakerTimeline';
import { TranscriptBubble } from '../components/TranscriptBubble';
import { speakerPalette, theme } from '../constants/theme';
import { DiarizationResponse } from '../types/diarization';

type ResultsScreenProps = {
  result: DiarizationResponse;
  onGoHome: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

type TabKey = 'Transcript' | 'Speakers';

const tabs: TabKey[] = ['Transcript', 'Speakers'];

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

    return [...entries].sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return a.end - b.end;
    });
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
                  return (
                    <View key={label} style={[styles.speakerChip, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}>
                      <View style={[styles.speakerDot, { backgroundColor: color }]} />
                      <Text style={[styles.speakerLabel, { color }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <SpeakerTimeline segments={result.segments} />
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
