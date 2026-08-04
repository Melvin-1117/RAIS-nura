import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TopAppBar } from '../components/TopAppBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { colors, getSpeakerColor, radius, spacing, typography } from '../constants/theme';
import { useTranscription } from '../hooks/useTranscription';

type LiveDashboardScreenProps = {
  apiBaseUrl?: string;
  onBack: () => void;
};

type LiveEntry = { speaker: string; text: string; at: string; color: string };

const speakerColors: Record<string, string> = {
  'Speaker A': colors.primary,
  'Speaker B': colors.secondary,
  'Speaker C': colors.tertiary,
  Unknown: colors.onSurfaceVariant,
};

const categoryIcons: Record<string, string> = {
  Natural: '🌿',
  Artificial: '⚙️',
  'Human Activity': '🤧',
  Music: '🎵',
  Animal: '🐾',
  Unclassified: '❓',
};

export const LiveDashboardScreen = ({ apiBaseUrl, onBack }: LiveDashboardScreenProps) => {
  const { transcript, connectionState, latestPayload, startLive, stopLive, error } = useTranscription(apiBaseUrl);
  const [seconds, setSeconds] = useState(0);

  const pulseLive = useRef(new Animated.Value(1)).current;
  const vuAnim = useRef(new Animated.Value(20)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  // Pulse animation for LIVE / Active status badge
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

  // Animate live VU meter bar per incoming chunk intensity_pct
  useEffect(() => {
    const targetPct = latestPayload?.intensity_pct ?? 25;
    Animated.spring(vuAnim, {
      toValue: Math.max(8, Math.min(100, targetPct)),
      friction: 5,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [latestPayload, vuAnim]);

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
    
    let displaySpeaker = item.speaker || 'Speaker A';
    if (displaySpeaker === 'A' || displaySpeaker === 'Speaker A') {
      displaySpeaker = 'Speaker A';
    } else if (displaySpeaker === 'B' || displaySpeaker === 'Speaker B') {
      displaySpeaker = 'Speaker B';
    }
    
    const color = getSpeakerColor(displaySpeaker);

    return {
      speaker: displaySpeaker,
      text: item.text,
      at: timeStr,
      color,
    };
  });

  const handleStop = () => {
    stopLive();
    onBack();
  };

  // 👥 Active Speakers panel data
  const activeSpeakersList = latestPayload?.active_speakers && latestPayload.active_speakers.length > 0
    ? latestPayload.active_speakers.map(s => {
        if (s === 'A' || s === 'Speaker A') return 'Speaker A';
        if (s === 'B' || s === 'Speaker B') return 'Speaker B';
        return s;
      })
    : ['Speaker A'];

  // 🔊 Background Sounds & 📍 Distance Map panel data
  const soundEventsList = latestPayload?.sound_events || [];

  // Connection State Badge Info
  const connectionText =
    connectionState === 'connected'
      ? 'Listening…'
      : connectionState === 'reconnecting'
      ? 'Reconnecting…'
      : connectionState === 'connecting'
      ? 'Connecting…'
      : 'Stopped';

  const connectionColor =
    connectionState === 'connected'
      ? colors.tertiary
      : connectionState === 'reconnecting'
      ? '#F59E0B'
      : colors.onSurfaceVariant;

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
        {/* ── Web Notice Card ─────────────────────────────── */}
        {Platform.OS === 'web' ? (
          <View style={styles.webNoticeCard}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>📱</Text>
            <Text style={styles.webNoticeTitle}>Mobile Live Feature</Text>
            <Text style={styles.webNoticeText}>
              Live microphone streaming uses native audio capture (Expo Go on iOS / Android).
              To test real-time intelligence on desktop web, please use <Text style={{ fontWeight: '700', color: colors.primary }}>Upload Audio File</Text> on the Home screen.
            </Text>
          </View>
        ) : (
          <>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            )}

            {/* ── Connection Loss Banner (Mobile Only) ─────────── */}
            {connectionState === 'reconnecting' && (
              <View style={styles.reconnectBanner}>
                <Animated.View style={[styles.reconnectDot, { opacity: pulseLive }]} />
                <Text style={styles.reconnectText}>
                  Connection interrupted — reconnecting automatically…
                </Text>
              </View>
            )}
            {connectionState === 'disconnected' && (
              <View style={styles.disconnectBanner}>
                <Text style={styles.disconnectText}>
                  ⚠️ Connection lost — please check your network
                </Text>
                <Pressable
                  onPress={() => { startLive().catch(() => {}); }}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* ── Stats & Connection Status Row ─────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active Speakers</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {String(activeSpeakersList.length).padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Chunks Processed</Text>
            <Text style={[styles.statValue, { color: colors.secondary }]}>
              {String(latestPayload?.chunk_id || 0).padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Animated.View style={[styles.liveStatusDot, { backgroundColor: connectionColor, opacity: pulseLive }]} />
              <Text style={[styles.statValue, { color: connectionColor, fontSize: 13 }]}>
                {connectionText}
              </Text>
            </View>
          </View>
        </View>

        {/* ── PANEL 1: 🎤 Live Transcript ──────────────────── */}
        <View style={[styles.glassCard, { maxHeight: 260 }]}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.cardTitle}>🎤 Live Transcript</Text>
            <View style={styles.autoScrollBadge}>
              <Text style={styles.autoScrollText}>REAL-TIME ASR (&lt;500ms)</Text>
            </View>
          </View>
          <ScrollView
            ref={scrollViewRef}
            style={styles.transcriptFeed}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {formattedEntries.length === 0 ? (
              <Text style={styles.emptyText}>Listening for continuous speech in real-time...</Text>
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

        {/* ── PANEL 2: 👥 Active Speakers ───────────────────── */}
        <View style={styles.glassCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>👥 Active Speakers</Text>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
              VAD + PROFILE ENROLLMENT
            </Text>
          </View>
          <View style={styles.speakerRow}>
            {activeSpeakersList.map((spk) => {
              const spkColor = getSpeakerColor(spk);
              return (
                <View key={spk} style={[styles.activeSpeakerPill, { borderColor: `${spkColor}50` }]}>
                  <Animated.View style={[styles.speakerPulseDot, { backgroundColor: spkColor, opacity: pulseLive }]} />
                  <Text style={[styles.activeSpeakerName, { color: spkColor }]}>{spk}</Text>
                  <Text style={styles.speakingStatusText}>Active</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── PANEL 3 & 4: 🔊 Background Sounds & 📍 Distance Map ── */}
        <View style={styles.glassCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🔊 Background Sounds & 📍 Distance Map</Text>
            <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>RAW CHUNK MODEL</Text>
          </View>

          {soundEventsList.length === 0 ? (
            <View style={styles.soundRow}>
              <View style={styles.soundLeft}>
                <Text style={{ fontSize: 16, color: colors.primary }}>🔉</Text>
                <Text style={styles.soundLabel}>Ambient Background</Text>
              </View>
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>📍 Mid (1–5m)</Text>
              </View>
            </View>
          ) : (
            soundEventsList.map((ev, idx) => {
              const icon = categoryIcons[ev.category || 'Artificial'] || '🔉';
              const distTier = ev.distance || 'Mid';
              const distBadgeColor =
                distTier === 'Near' ? '#4edea3' : distTier === 'Far' ? '#a78bfa' : '#F59E0B';

              return (
                <View key={idx} style={styles.soundRow}>
                  <View style={styles.soundLeft}>
                    <Text style={{ fontSize: 16 }}>{icon}</Text>
                    <View>
                      <Text style={styles.soundLabel}>
                        {ev.label === 'Unknown Sound' ? 'Unrecognized Sound' : ev.label}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.onSurfaceVariant }}>
                        {ev.category || 'Artificial'} • {Math.round((ev.confidence || 0.8) * 100)}% conf
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.distancePill, { borderColor: `${distBadgeColor}40`, borderWidth: 1 }]}>
                    <Text style={[styles.distanceText, { color: distBadgeColor }]}>
                      {distTier === 'Near' ? '🎯 Near (<1m)' : distTier === 'Far' ? '📡 Far (>5m)' : '📍 Mid (1–5m)'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── PANEL 5: 📊 Animated Intensity VU Meter ───────── */}
        <View style={styles.glassCard}>
          <View style={[styles.cardTitleBordered, { borderLeftColor: colors.secondary }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardTitle}>📊 Live Intensity VU Meter</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.secondary }}>
                {Math.round(latestPayload?.intensity_pct || 25)}% Peak RMS
              </Text>
            </View>
          </View>

          <View style={styles.intensityGroup}>
            <View style={styles.intensityRow}>
              <View style={styles.intensityHeader}>
                <Text style={styles.intensityLabel}>Real-Time Micro-Loudness</Text>
                <Text style={[styles.intensityValue, { color: colors.secondary }]}>
                  {latestPayload?.intensity_pct && latestPayload.intensity_pct > 70
                    ? '🔴 High'
                    : latestPayload?.intensity_pct && latestPayload.intensity_pct >= 30
                    ? '🟡 Medium'
                    : '🟢 Low'}
                </Text>
              </View>
              <View style={styles.intensityTrack}>
                <Animated.View
                  style={[
                    styles.intensityFill,
                    {
                      width: vuAnim.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor:
                        latestPayload?.intensity_pct && latestPayload.intensity_pct > 70
                          ? colors.error
                          : latestPayload?.intensity_pct && latestPayload.intensity_pct >= 30
                          ? '#F59E0B'
                          : colors.tertiary,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.waveformContainer}>
              <WaveformPlaceholder
                bars={Array.from({ length: 32 }, () => Math.random() * (latestPayload?.intensity_pct || 30) + 15)}
                color={colors.primary}
              />
            </View>
          </View>
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
  statLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, marginBottom: 4, textAlign: 'center' },
  statValue: { ...typography.headlineLg },
  liveStatusDot: { width: 8, height: 8, borderRadius: 4 },

  glassCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { ...typography.headlineMd, color: colors.onSurface },
  cardTitleBordered: { borderLeftWidth: 4, paddingLeft: spacing.md, marginBottom: spacing.md },

  speakerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  activeSpeakerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  speakerPulseDot: { width: 8, height: 8, borderRadius: 4 },
  activeSpeakerName: { ...typography.labelMd, fontWeight: '700' },
  speakingStatusText: { ...typography.labelMd, color: colors.onSurfaceVariant, fontSize: 10 },

  waveformContainer: { height: 70, justifyContent: 'center', marginTop: spacing.sm },

  intensityGroup: { gap: spacing.md },
  intensityRow: { gap: 6 },
  intensityHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  intensityLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  intensityValue: { ...typography.labelMd, fontWeight: '700' },
  intensityTrack: { height: 10, backgroundColor: colors.surfaceContainer, borderRadius: radius.pill, overflow: 'hidden' },
  intensityFill: { height: '100%', borderRadius: radius.pill },

  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: spacing.sm,
  },
  autoScrollBadge: { backgroundColor: 'rgba(192, 193, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  autoScrollText: { ...typography.labelMd, color: colors.primary, fontSize: 10, fontWeight: '700' },
  transcriptFeed: { maxHeight: 180 },
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
  soundLabel: { ...typography.bodySm, color: colors.onSurface, fontWeight: '600' },
  distancePill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  distanceText: { fontSize: 10, fontWeight: '700' },

  // Connection loss banners
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  reconnectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  reconnectText: {
    ...typography.bodySm,
    color: '#F59E0B',
    flex: 1,
  },
  disconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  disconnectText: {
    ...typography.bodySm,
    color: colors.error,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.error,
    marginLeft: spacing.sm,
  },
  retryBtnText: {
    ...typography.labelMd,
    color: colors.error,
  },

  // Web Notice Card
  webNoticeCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  webNoticeTitle: {
    ...typography.headlineMd,
    color: colors.onSurface,
    marginBottom: 6,
  },
  webNoticeText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
  },
});
