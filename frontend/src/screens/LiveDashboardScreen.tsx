import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopAppBar } from '../components/TopAppBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useTranscription } from '../hooks/useTranscription';

type LiveDashboardScreenProps = { onBack: () => void };

type LiveEntry = { speaker: string; text: string; at: string; color: string };

const speakerColors: Record<string, string> = {
  'Speaker A': colors.primary,
  'Speaker B': colors.secondary,
  'Speaker C': colors.tertiary,
};

const defaultBackgroundSounds = [
  { icon: '🗣️', label: 'Human Speech', distance: 'Near (< 1m)' },
  { icon: '💨', label: 'HVAC Ambient', distance: 'Mid (2m)' },
  { icon: '⌨️', label: 'Mechanical Typing', distance: 'Near (1m)' },
];

export const LiveDashboardScreen = ({ onBack }: LiveDashboardScreenProps) => {
  const { transcript, startLive, stopLive, error } = useTranscription();
  const [seconds, setSeconds] = useState(0);
  const pulseLive = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // Pulse animation for LIVE badge
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseLive, { toValue: 0.3, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseLive, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseLive]);

  // Session Duration Timer
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Start real-time local transcription session on mount
  useEffect(() => {
    let mounted = true;

    startLive().catch((err) => {
      if (mounted) {
        console.warn('Failed to auto-start live transcription:', err?.message);
      }
    });

    return () => {
      mounted = false;
      stopLive();
    };
  }, [startLive, stopLive]);

  // Auto scroll transcript feed to latest entry
  useEffect(() => {
    if (transcript.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [transcript]);

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const formattedEntries: LiveEntry[] = transcript.map((item) => {
    const date = new Date(item.startTime * 1000);
    const timeStr = `${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    const speakerKey = item.speaker ? `Speaker ${item.speaker}` : 'Speaker A';
    const color = speakerColors[speakerKey] || colors.primary;

    return {
      speaker: speakerKey,
      text: item.text,
      at: timeStr,
      color,
    };
  });

  const handleStop = () => {
    stopLive();
    onBack();
  };

  const uniqueSpeakersCount = new Set(transcript.map((t) => t.speaker)).size || 1;

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <TopAppBar
        variant="back"
        title="Live Local Intelligence"
        onBack={handleStop}
        rightElement={
          <Pressable onPress={handleStop} style={styles.stopBtn}>
            <Text style={styles.stopBtnText}>STOP</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* ── Stats Row ────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Speakers</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {String(uniqueSpeakersCount).padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Entries</Text>
            <Text style={[styles.statValue, { color: colors.secondary }]}>
              {String(transcript.length).padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Animated.View style={[styles.liveStatusDot, { opacity: pulseLive }]} />
              <Text style={[styles.statValue, { color: colors.tertiary }]}>Local Live</Text>
            </View>
          </View>
        </View>

        {/* ── Audio Monitor ────────────────────────────────── */}
        <View style={styles.glassCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Local Audio Stream</Text>
            <Text style={{ color: colors.primary, fontSize: 20 }}>📊</Text>
          </View>
          <View style={styles.waveformContainer}>
            <WaveformPlaceholder
              bars={Array.from({ length: 32 }, () => Math.random() * 80 + 20)}
              color={colors.primary}
            />
          </View>
          <View style={styles.monitorFooter}>
            <View>
              <Text style={styles.monitorLabel}>Engine</Text>
              <Text style={styles.monitorValue}>Faster-Whisper (Local)</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.monitorLabel}>Duration</Text>
              <Text style={[styles.monitorDuration, { color: colors.primary }]}>{formatTime(seconds)}</Text>
            </View>
          </View>
        </View>

        {/* ── Signal Intensity ─────────────────────────────── */}
        <View style={styles.glassCard}>
          <View style={[styles.cardTitleBordered, { borderLeftColor: colors.secondary }]}>
            <Text style={styles.cardTitle}>Signal Intensity</Text>
          </View>
          <View style={styles.intensityGroup}>
            {[
              { label: 'Speech Presence', value: transcript.length > 0 ? 88 : 35, color: colors.secondary },
              { label: 'Ambient Level', value: 20, color: colors.primary },
              { label: 'Signal-to-Noise', value: 92, color: colors.tertiary },
            ].map((item) => (
              <View key={item.label} style={styles.intensityRow}>
                <View style={styles.intensityHeader}>
                  <Text style={styles.intensityLabel}>{item.label}</Text>
                  <Text style={[styles.intensityValue, { color: item.color }]}>{item.value}%</Text>
                </View>
                <View style={styles.intensityTrack}>
                  <View style={[styles.intensityFill, { width: `${item.value}%`, backgroundColor: item.color }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Transcript ───────────────────────────────────── */}
        <View style={[styles.glassCard, { maxHeight: 320 }]}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.cardTitle}>Live Transcript</Text>
            <View style={styles.autoScrollBadge}>
              <Text style={styles.autoScrollText}>REAL-TIME ASR</Text>
            </View>
          </View>
          <ScrollView
            ref={scrollViewRef}
            style={styles.transcriptFeed}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {formattedEntries.length === 0 ? (
              <Text style={styles.emptyText}>Listening for speech in real-time...</Text>
            ) : (
              formattedEntries.map((entry, i) => (
                <View key={i} style={styles.transcriptEntry}>
                  <View style={styles.transcriptMeta}>
                    <View style={[styles.speakerBadge, { backgroundColor: `${entry.color}22` }]}>
                      <Text style={[styles.speakerBadgeText, { color: entry.color }]}>{entry.speaker}</Text>
                    </View>
                    <Text style={styles.transcriptTime}>{entry.at}</Text>
                  </View>
                  <Text style={styles.transcriptText}>{entry.text}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>

        {/* ── Background Sounds ────────────────────────────── */}
        <View style={styles.glassCard}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Background Sound Classification</Text>
          {defaultBackgroundSounds.map((sound) => (
            <View key={sound.label} style={styles.soundRow}>
              <View style={styles.soundLeft}>
                <Text style={{ fontSize: 16, color: colors.primary }}>{sound.icon}</Text>
                <Text style={styles.soundLabel}>{sound.label}</Text>
              </View>
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>{sound.distance}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: 40, gap: spacing.md },

  errorBox: {
    backgroundColor: 'rgba(255, 80, 80, 0.15)',
    borderColor: colors.error,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { ...typography.bodySm, color: colors.error },

  stopBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.pill,
  },
  stopBtnText: { ...typography.labelMd, color: colors.error, textTransform: 'uppercase' },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, marginBottom: 4 },
  statValue: { ...typography.headlineLg },
  liveStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tertiary },

  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  cardTitle: { ...typography.headlineMd, color: colors.onSurface },
  cardTitleBordered: { borderLeftWidth: 4, paddingLeft: spacing.md, marginBottom: spacing.lg },

  waveformContainer: { height: 120, justifyContent: 'center' },

  monitorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.lg },
  monitorLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  monitorValue: { ...typography.bodyMd, fontFamily: 'monospace' },
  monitorDuration: { ...typography.headlineMd },

  intensityGroup: { gap: spacing.md },
  intensityRow: { gap: 4 },
  intensityHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  intensityLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  intensityValue: { ...typography.labelMd },
  intensityTrack: { height: 8, backgroundColor: colors.surfaceContainer, borderRadius: radius.pill, overflow: 'hidden' },
  intensityFill: { height: '100%', borderRadius: radius.pill },

  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: spacing.md,
  },
  autoScrollBadge: { backgroundColor: 'rgba(192, 193, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  autoScrollText: { ...typography.labelMd, color: colors.primary, fontSize: 10 },
  transcriptFeed: { maxHeight: 220 },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontStyle: 'italic', paddingVertical: spacing.md },
  transcriptEntry: { marginBottom: spacing.md },
  transcriptMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  speakerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  speakerBadgeText: { ...typography.labelMd },
  transcriptTime: { fontSize: 10, color: colors.onSurfaceVariant },
  transcriptText: { ...typography.bodyMd, color: colors.onSurface },

  soundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: spacing.sm,
  },
  soundLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  soundLabel: { ...typography.bodySm, color: colors.onSurface },
  distancePill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  distanceText: { fontSize: 10, fontWeight: '700', color: colors.onSurfaceVariant },
});
