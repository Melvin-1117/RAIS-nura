import { requestRecordingPermissionsAsync } from 'expo-audio';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DistanceBadge } from '../components/DistanceBadge';
import { IntensityBar } from '../components/IntensityBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { theme } from '../constants/theme';

type LiveDashboardScreenProps = { onBack: () => void };

type LiveEntry = { speaker: string; text: string; at: string };
type LiveSound = { label: string; category: string; distance: 'Near' | 'Mid' | 'Far'; intensity: 'Low' | 'Medium' | 'High' };

const transcriptSamples = [
  { speaker: 'Speaker A', text: 'Can you hear me clearly now?' },
  { speaker: 'Speaker B', text: 'Yes, the audio feed is stable.' },
  { speaker: 'Speaker A', text: 'Great, continuing live analysis.' },
  { speaker: 'Speaker C', text: 'Background is a bit noisy.' },
];

const soundSamples: LiveSound[] = [
  { label: 'Fan hum', category: 'Artificial', distance: 'Mid', intensity: 'Low' },
  { label: 'Keyboard clicks', category: 'Artificial', distance: 'Near', intensity: 'Medium' },
  { label: 'Street traffic', category: 'Artificial', distance: 'Far', intensity: 'Low' },
  { label: 'Cough', category: 'Human Activity', distance: 'Near', intensity: 'High' },
];

const speakerColors: Record<string, string> = {
  'Speaker A': theme.accent,
  'Speaker B': theme.accentCyan,
  'Speaker C': theme.accentGreen,
};

export const LiveDashboardScreen = ({ onBack }: LiveDashboardScreenProps) => {
  const [isListening, setIsListening] = useState(false);
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [sounds, setSounds] = useState<LiveSound[]>(soundSamples.slice(0, 2));
  const pulseLive = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isListening) { pulseLive.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseLive, { toValue: 0.3, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseLive, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isListening, pulseLive]);

  useEffect(() => {
    if (!isListening) return;
    let idx = 0;
    const interval = setInterval(() => {
      const s = transcriptSamples[idx % transcriptSamples.length];
      setEntries(prev => [{ ...s, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 12));
      setSounds(prev => [soundSamples[(idx + 1) % soundSamples.length], ...prev].slice(0, 4));
      idx++;
    }, 1800);
    return () => clearInterval(interval);
  }, [isListening]);

  const activeSpeakers = useMemo(() => Array.from(new Set(entries.map(e => e.speaker))), [entries]);

  const startListening = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required.'); return; }
    setIsListening(true);
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <View style={styles.titleGroup}>
          <Text style={styles.screenTitle}>Live Session</Text>
          {isListening && (
            <Animated.View style={[styles.liveDot, { opacity: pulseLive }]} />
          )}
        </View>
        {!isListening ? (
          <Pressable onPress={startListening} style={({ pressed }) => [styles.startBtn, pressed && styles.pressed]}>
            <Text style={styles.startBtnText}>Start</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setIsListening(false)} style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <Text style={styles.statusValue}>{activeSpeakers.length}</Text>
            <Text style={styles.statusLabel}>Speakers</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusValue}>{entries.length}</Text>
            <Text style={styles.statusLabel}>Entries</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={[styles.statusValue, { color: isListening ? theme.accentGreen : theme.textMuted }]}>
              {isListening ? 'Live' : 'Idle'}
            </Text>
            <Text style={styles.statusLabel}>Status</Text>
          </View>
        </View>

        {/* Waveform (when listening) */}
        {isListening && (
          <View style={styles.waveCard}>
            <WaveformPlaceholder color={theme.accent} />
          </View>
        )}

        {/* Transcript Panel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          {entries.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>{isListening ? 'Listening…' : 'Press Start to begin'}</Text>
            </View>
          ) : (
            entries.map((entry, idx) => {
              const color = speakerColors[entry.speaker] || theme.accent;
              return (
                <View key={`${entry.at}-${idx}`} style={styles.transcriptRow}>
                  <View style={[styles.rowStripe, { backgroundColor: color }]} />
                  <View style={styles.rowBody}>
                    <View style={styles.rowHead}>
                      <Text style={[styles.rowSpeaker, { color }]}>{entry.speaker}</Text>
                      <Text style={styles.rowTime}>{entry.at}</Text>
                    </View>
                    <Text style={styles.rowText}>{entry.text}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Background Sounds */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background Sounds</Text>
          {sounds.map((s, idx) => (
            <View key={`${s.label}-${idx}`} style={styles.soundRow}>
              <View style={styles.soundLeft}>
                <Text style={styles.soundLabel}>{s.label}</Text>
                <Text style={styles.soundCategory}>{s.category}</Text>
              </View>
              <DistanceBadge distance={s.distance} />
            </View>
          ))}
        </View>

        {/* Intensity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signal Intensity</Text>
          {sounds.map((s, idx) => (
            <IntensityBar key={`${s.label}-i-${idx}`} label={s.label} intensity={s.intensity} />
          ))}
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.background,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: theme.textMuted, fontSize: 14, fontWeight: '500' },
  titleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },
  startBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.accent,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stopBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.radius.pill,
    backgroundColor: theme.card, borderWidth: 1, borderColor: `${theme.danger}40`,
  },
  stopBtnText: { color: theme.danger, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.7 },

  scroll: { padding: 20, paddingBottom: 48 },

  // Status
  statusBar: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'space-around',
  },
  statusItem: { alignItems: 'center', gap: 4 },
  statusValue: { color: theme.textPrimary, fontSize: 22, fontWeight: '700' },
  statusLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '500' },
  statusDivider: { width: 1, backgroundColor: theme.border },

  // Waveform
  waveCard: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Empty
  emptyRow: {
    backgroundColor: theme.card, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.border,
    paddingVertical: 24, alignItems: 'center',
  },
  emptyText: { color: theme.textMuted, fontSize: 14 },

  // Transcript
  transcriptRow: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  rowStripe: { width: 3 },
  rowBody: { flex: 1, padding: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowSpeaker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowTime: { color: theme.textMuted, fontSize: 11 },
  rowText: { color: theme.textPrimary, fontSize: 13, lineHeight: 20 },

  // Sounds
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  soundLeft: { flex: 1 },
  soundLabel: { color: theme.textPrimary, fontWeight: '500', fontSize: 14 },
  soundCategory: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
});
