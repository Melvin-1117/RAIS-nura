import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { colors, radius, spacing, typography } from '../constants/theme';

type LiveDashboardScreenProps = { onBack: () => void };

type LiveEntry = { speaker: string; text: string; at: string; color: string };

const speakerColors: Record<string, string> = {
  'Speaker A': colors.primary,
  'Speaker B': colors.secondary,
  'Speaker C': colors.tertiary,
};

const initialTranscript: LiveEntry[] = [
  { speaker: 'Speaker A', text: 'Checking audio levels from the primary microphone array...', at: '12:44:02', color: colors.primary },
  { speaker: 'Speaker B', text: 'Levels look good. Signal-to-noise ratio is optimal for this environment.', at: '12:44:15', color: colors.secondary },
];

const delayedMessages: LiveEntry[] = [
  { speaker: 'Speaker A', text: 'Analyzing ambient background hum...', at: '', color: colors.primary },
  { speaker: 'Speaker C', text: 'Filter applied at 50Hz and 60Hz. Signal clarified.', at: '', color: colors.tertiary },
  { speaker: 'Speaker B', text: 'Understood. Proceeding with full spectrum analysis.', at: '', color: colors.secondary },
];

const backgroundSounds = [
  { icon: '💨', label: 'HVAC System', distance: '12m' },
  { icon: '🚗', label: 'City Traffic', distance: '45m' },
  { icon: '⌨️', label: 'Mechanical Typing', distance: '2m' },
];

export const LiveDashboardScreen = ({ onBack }: LiveDashboardScreenProps) => {
  const [entries, setEntries] = useState<LiveEntry[]>(initialTranscript);
  const [seconds, setSeconds] = useState(765); // 12m 45s
  const pulseLive = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseLive, { toValue: 0.3, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseLive, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseLive]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Simulated transcript injection
  useEffect(() => {
    const timers = delayedMessages.map((msg, i) =>
      setTimeout(() => {
        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        setEntries(prev => [...prev, { ...msg, at: time }]);
      }, 3000 + i * 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <TopAppBar
        variant="back"
        title="Live Session"
        onBack={onBack}
        rightElement={
          <Pressable onPress={onBack} style={styles.stopBtn}>
            <Text style={styles.stopBtnText}>STOP</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Stats Row ────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Speakers</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>03</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Entries</Text>
            <Text style={[styles.statValue, { color: colors.secondary }]}>{entries.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Animated.View style={[styles.liveStatusDot, { opacity: pulseLive }]} />
              <Text style={[styles.statValue, { color: colors.tertiary }]}>Live</Text>
            </View>
          </View>
        </View>

        {/* ── Audio Monitor ────────────────────────────────── */}
        <View style={styles.glassCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Audio Monitor</Text>
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
              <Text style={styles.monitorLabel}>Session ID</Text>
              <Text style={styles.monitorValue}>NR-992-LX</Text>
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
              { label: 'Speech Presence', value: 88, color: colors.secondary },
              { label: 'Ambient Noise', value: 14, color: colors.primary },
              { label: 'Electronic Hum', value: 2, color: colors.tertiary },
            ].map(item => (
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
        <View style={[styles.glassCard, { maxHeight: 300 }]}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.cardTitle}>Transcript</Text>
            <View style={styles.autoScrollBadge}>
              <Text style={styles.autoScrollText}>AUTO-SCROLL</Text>
            </View>
          </View>
          <ScrollView style={styles.transcriptFeed} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {entries.map((entry, i) => (
              <View key={i} style={styles.transcriptEntry}>
                <View style={styles.transcriptMeta}>
                  <View style={[styles.speakerBadge, { backgroundColor: `${entry.color}22` }]}>
                    <Text style={[styles.speakerBadgeText, { color: entry.color }]}>{entry.speaker}</Text>
                  </View>
                  <Text style={styles.transcriptTime}>{entry.at}</Text>
                </View>
                <Text style={styles.transcriptText}>{entry.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Background Sounds ────────────────────────────── */}
        <View style={styles.glassCard}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Background Sounds</Text>
          {backgroundSounds.map((sound) => (
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

  // Stop button
  stopBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.pill,
  },
  stopBtnText: { ...typography.labelMd, color: colors.error, textTransform: 'uppercase' },

  // Stats
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

  // Glass Card
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

  // Waveform
  waveformContainer: { height: 120, justifyContent: 'center' },

  // Monitor Footer
  monitorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.lg },
  monitorLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  monitorValue: { ...typography.bodyMd, fontFamily: 'monospace' },
  monitorDuration: { ...typography.headlineMd },

  // Intensity
  intensityGroup: { gap: spacing.md },
  intensityRow: { gap: 4 },
  intensityHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  intensityLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  intensityValue: { ...typography.labelMd },
  intensityTrack: { height: 8, backgroundColor: colors.surfaceContainer, borderRadius: radius.pill, overflow: 'hidden' },
  intensityFill: { height: '100%', borderRadius: radius.pill },

  // Transcript
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: spacing.md },
  autoScrollBadge: { backgroundColor: 'rgba(192, 193, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  autoScrollText: { ...typography.labelMd, color: colors.primary, fontSize: 10 },
  transcriptFeed: { maxHeight: 200 },
  transcriptEntry: { marginBottom: spacing.md },
  transcriptMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  speakerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  speakerBadgeText: { ...typography.labelMd },
  transcriptTime: { fontSize: 10, color: colors.onSurfaceVariant },
  transcriptText: { ...typography.bodyMd, color: colors.onSurface },

  // Background Sounds
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
