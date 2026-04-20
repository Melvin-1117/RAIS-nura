import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { theme } from '../constants/theme';
import { PickedAudio } from '../types/app';

type HomeScreenProps = {
  onStartProcess: (audio: PickedAudio) => void;
  onOpenLive: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

// ── Feature cards data ──────────────────────────────────────────────────────
const features = [
  {
    emoji: '🎙️',
    title: 'Speaker\nDetection',
    description: 'Count & identify speakers',
    gradient: ['#6366F1', '#8B5CF6'] as const,
  },
  {
    emoji: '📝',
    title: 'Smart\nTranscript',
    description: 'Speaker-aware text output',
    gradient: ['#06B6D4', '#0EA5E9'] as const,
  },
  {
    emoji: '🔊',
    title: 'Sound\nClassification',
    description: 'Categorize every sound',
    gradient: ['#10B981', '#34D399'] as const,
  },
  {
    emoji: '📍',
    title: 'Spatial\nAnalysis',
    description: 'Distance & intensity mapping',
    gradient: ['#F59E0B', '#FBBF24'] as const,
  },
];

export const HomeScreen = ({
  onStartProcess,
  onOpenLive,
  onOpenProfiles,
  onOpenSettings,
}: HomeScreenProps) => {
  const [selectedAudio, setSelectedAudio] = useState<PickedAudio | null>(null);
  const [recording, setRecording] = useState<AudioRecorder | null>(null);

  // Entrance animations
  const fadeHero = useRef(new Animated.Value(0)).current;
  const slideHero = useRef(new Animated.Value(30)).current;
  const fadeCards = useRef(new Animated.Value(0)).current;
  const slideCTA = useRef(new Animated.Value(40)).current;
  const fadeCTA = useRef(new Animated.Value(0)).current;
  const fadeNav = useRef(new Animated.Value(0)).current;

  // Pulsing glow for the Live button
  const liveGlow = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const sequence = Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(fadeHero, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slideHero, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.timing(fadeCards, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.parallel([
        Animated.timing(fadeCTA, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slideCTA, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.timing(fadeNav, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
    ]);
    sequence.start();

    // Live glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(liveGlow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(liveGlow, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ).start();
  }, [fadeHero, slideHero, fadeCards, fadeCTA, slideCTA, fadeNav, liveGlow]);

  // ── Audio actions ───────────────────────────────────────────────────────
  const pickAudio = async () => {
    const file = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (file.canceled) return;
    const firstFile = file.assets[0];
    const audio = {
      uri: firstFile.uri,
      name: firstFile.name ?? `audio-${Date.now()}.wav`,
      mimeType: firstFile.mimeType ?? 'audio/wav',
    };
    setSelectedAudio(audio);
    onStartProcess(audio);
  };

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Recording is not supported on web in this build. Please upload an audio file.');
      return;
    }

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone permission is required.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const audioModuleAny = AudioModule as any;
    const newRecording: AudioRecorder = audioModuleAny?.createAudioRecorder
      ? audioModuleAny.createAudioRecorder(RecordingPresets.HIGH_QUALITY)
      : new audioModuleAny.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await newRecording.prepareToRecordAsync();
    newRecording.record();
    setRecording(newRecording);
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stop();
    const uri = recording.uri;
    if (!uri) {
      Alert.alert('Could not access recorded audio file.');
      setRecording(null);
      return;
    }
    const audio = { uri, name: `recording-${Date.now()}.m4a`, mimeType: 'audio/x-m4a' };
    setSelectedAudio(audio);
    onStartProcess(audio);
    setRecording(null);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Brand Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={[theme.accent, theme.accentCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBg}
              >
                <View style={styles.logoBarGroup}>
                  <View style={[styles.logoBar, { height: 10 }]} />
                  <View style={[styles.logoBar, { height: 16 }]} />
                  <View style={[styles.logoBar, { height: 12 }]} />
                  <View style={[styles.logoBar, { height: 18 }]} />
                  <View style={[styles.logoBar, { height: 8 }]} />
                </View>
              </LinearGradient>
            </View>
            <View>
              <Text style={styles.logoTitle}>RAIS</Text>
              <Text style={styles.logoSubtitle}>Audio Intelligence</Text>
            </View>
          </View>
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>

        {/* ── Hero Section ────────────────────────────────────────────── */}
        <Animated.View style={[styles.hero, { opacity: fadeHero, transform: [{ translateY: slideHero }] }]}>
          <Text style={styles.heroHeading}>
            Understand{'\n'}every{' '}
            <Text style={styles.heroAccent}>voice</Text>
            {' '}&{'\n'}
            <Text style={styles.heroAccent}>sound.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Upload or record audio — get speaker-aware transcripts, sound classification, distance & intensity analysis, all powered by AI.
          </Text>
        </Animated.View>

        {/* ── Feature Grid ────────────────────────────────────────────── */}
        <Animated.View style={[styles.featureGrid, { opacity: fadeCards }]}>
          {features.map((f, i) => (
            <View key={f.title} style={styles.featureCard}>
              <LinearGradient
                colors={[`${f.gradient[0]}18`, `${f.gradient[1]}08`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.featureCardGradient}
              >
                <View style={[styles.featureEmojiWrap, { backgroundColor: `${f.gradient[0]}20` }]}>
                  <Text style={styles.featureEmoji}>{f.emoji}</Text>
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.description}</Text>
              </LinearGradient>
            </View>
          ))}
        </Animated.View>

        {/* ── Audio Input Card (CTA) ──────────────────────────────────── */}
        <Animated.View style={[styles.ctaSection, { opacity: fadeCTA, transform: [{ translateY: slideCTA }] }]}>
          <View style={styles.ctaCard}>
            <LinearGradient
              colors={['rgba(99, 102, 241, 0.08)', 'rgba(6, 182, 212, 0.04)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaCardInner}
            >
              <Text style={styles.ctaSectionLabel}>GET STARTED</Text>

              {/* Waveform */}
              <View style={styles.waveformRow}>
                <WaveformPlaceholder color={theme.accent} />
              </View>

              {/* Selected file indicator */}
              {selectedAudio && (
                <View style={styles.fileRow}>
                  <View style={styles.fileIcon}>
                    <Text style={styles.fileIconEmoji}>🎵</Text>
                  </View>
                  <Text style={styles.fileName} numberOfLines={1}>{selectedAudio.name}</Text>
                  <Pressable onPress={() => setSelectedAudio(null)} style={styles.clearBtn}>
                    <Text style={styles.clearText}>×</Text>
                  </Pressable>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  onPress={pickAudio}
                  style={({ pressed }) => [styles.uploadBtn, pressed && styles.btnPressed]}
                >
                  <LinearGradient
                    colors={theme.gradients.button}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientBtnInner}
                  >
                    <Text style={styles.uploadBtnIcon}>📁</Text>
                    <Text style={styles.uploadBtnText}>Upload File</Text>
                  </LinearGradient>
                </Pressable>

                {!recording ? (
                  <Pressable
                    onPress={startRecording}
                    style={({ pressed }) => [styles.recordBtn, pressed && styles.btnPressed]}
                  >
                    <View style={styles.recDot} />
                    <Text style={styles.recordBtnText}>Record</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={stopRecording}
                    style={({ pressed }) => [styles.recordBtn, styles.recordBtnDanger, pressed && styles.btnPressed]}
                  >
                    <View style={styles.stopSquare} />
                    <Text style={[styles.recordBtnText, { color: theme.danger }]}>Stop</Text>
                  </Pressable>
                )}
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <Animated.View style={[styles.quickSection, { opacity: fadeNav }]}>
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>

          {/* Live Listening — highlighted card */}
          <Pressable
            onPress={onOpenLive}
            style={({ pressed }) => [styles.liveCard, pressed && styles.btnPressed]}
          >
            <LinearGradient
              colors={['rgba(239, 68, 68, 0.12)', 'rgba(249, 115, 22, 0.06)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liveCardInner}
            >
              <View style={styles.liveLeft}>
                <View style={styles.liveIconWrap}>
                  <Animated.View style={[styles.livePulseRing, { opacity: liveGlow }]} />
                  <View style={styles.liveDotInner} />
                </View>
                <View style={styles.liveTextGroup}>
                  <Text style={styles.liveTitle}>Live Listening</Text>
                  <Text style={styles.liveSub}>Real-time speaker & sound analysis</Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </LinearGradient>
          </Pressable>

          {/* Bottom row: Speaker Profiles + Settings */}
          <View style={styles.quickRow}>
            <Pressable
              onPress={onOpenProfiles}
              style={({ pressed }) => [styles.quickCard, pressed && styles.btnPressed]}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: `${theme.accent}18` }]}>
                <Text style={styles.quickEmoji}>👥</Text>
              </View>
              <Text style={styles.quickTitle}>Speaker{'\n'}Profiles</Text>
              <Text style={styles.quickSub}>Manage voices</Text>
            </Pressable>

            <Pressable
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.quickCard, pressed && styles.btnPressed]}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <Text style={styles.quickEmoji}>⚙️</Text>
              </View>
              <Text style={styles.quickTitle}>Settings{'\n'}& Config</Text>
              <Text style={styles.quickSub}>API & thresholds</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>RAIS · Real-time Audio Intelligence System</Text>
          <Text style={styles.footerVersion}>v1.0 · Nura AI Labs</Text>
        </View>

      </ScrollView>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 56,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  logoBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBarGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  logoBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  logoTitle: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  logoSubtitle: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: -1,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },

  // ── Hero ────────────────────────────────────────────────────────────────
  hero: {
    marginBottom: 28,
  },
  heroHeading: {
    color: theme.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 44,
    marginBottom: 14,
  },
  heroAccent: {
    color: theme.accent,
  },
  heroSub: {
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    maxWidth: 340,
  },

  // ── Feature Grid ────────────────────────────────────────────────────────
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  featureCard: {
    width: '48%' as any,
    flexGrow: 1,
    flexBasis: '46%' as any,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  featureCardGradient: {
    padding: 16,
    minHeight: 130,
  },
  featureEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureEmoji: {
    fontSize: 18,
  },
  featureTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 4,
  },
  featureDesc: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 16,
  },

  // ── CTA Card ────────────────────────────────────────────────────────────
  ctaSection: {
    marginBottom: 28,
  },
  ctaCard: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  ctaCardInner: {
    padding: 20,
  },
  ctaSectionLabel: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  waveformRow: {
    marginBottom: 16,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: `${theme.accent}25`,
    marginBottom: 16,
  },
  fileIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconEmoji: {
    fontSize: 14,
  },
  fileName: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadBtn: {
    flex: 1,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  gradientBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  uploadBtnIcon: {
    fontSize: 14,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  recordBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderLight,
    backgroundColor: theme.surface,
    paddingVertical: 14,
  },
  recordBtnDanger: {
    borderColor: `${theme.danger}40`,
    backgroundColor: `${theme.danger}10`,
  },
  recordBtnText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.danger,
  },
  stopSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: theme.danger,
  },

  // ── Quick Actions ───────────────────────────────────────────────────────
  quickSection: {
    marginBottom: 32,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  // Live card
  liveCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: `${theme.danger}25`,
    overflow: 'hidden',
    marginBottom: 12,
  },
  liveCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
  },
  liveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  liveIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: `${theme.danger}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.danger,
  },
  liveDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.danger,
  },
  liveTextGroup: {
    flex: 1,
    gap: 2,
  },
  liveTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  liveSub: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '400',
  },
  chevron: {
    color: theme.textMuted,
    fontSize: 24,
    fontWeight: '300',
  },

  // Quick row (2 cards)
  quickRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickCard: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    gap: 10,
  },
  quickIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEmoji: {
    fontSize: 18,
  },
  quickTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  quickSub: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '400',
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  footerDivider: {
    width: 40,
    height: 1,
    backgroundColor: theme.border,
    marginBottom: 16,
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  footerVersion: {
    color: `${theme.textMuted}80`,
    fontSize: 10,
    fontWeight: '400',
  },

  // ── Shared ──────────────────────────────────────────────────────────────
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});
