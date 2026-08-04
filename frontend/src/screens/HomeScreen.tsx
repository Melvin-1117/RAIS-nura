import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { accents, colors, gradients, radius, spacing, typography } from '../constants/theme';
import { PickedAudio } from '../types/app';

type HomeScreenProps = {
  onStartProcess: (audio: PickedAudio) => void;
  onOpenLive: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

// ── Feature cards data ──────────────────────────────────────────────────────
const features = [
  { icon: '🎙️', title: 'Speaker\nDetection', color: colors.primary, hoverBorder: colors.primary },
  { icon: '📝', title: 'Smart\nTranscript', color: colors.secondary, hoverBorder: colors.secondary },
  { icon: '🔊', title: 'Sound\nClassification', color: colors.tertiary, hoverBorder: colors.tertiary },
  { icon: '📍', title: 'Spatial\nAnalysis', color: accents.orange, hoverBorder: accents.orange },
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
  const fadeRecent = useRef(new Animated.Value(0)).current;

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
      Animated.timing(fadeRecent, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
    ]);
    sequence.start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(liveGlow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(liveGlow, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ).start();
  }, [fadeHero, slideHero, fadeCards, fadeCTA, slideCTA, fadeRecent, liveGlow]);

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

  const handleNavigation = (tab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (tab === 'live') onOpenLive();
    else if (tab === 'profiles') onOpenProfiles();
    else if (tab === 'settings') onOpenSettings();
  };

  return (
    <View style={styles.container}>
      {/* ── Top App Bar ────────────────────────────────────────────── */}
      <TopAppBar
        variant="logo"
        rightElement={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onOpenProfiles} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.headerBtnIcon}>👥</Text>
            </Pressable>
            <Pressable onPress={onOpenSettings} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.headerBtnIcon}>⚙️</Text>
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero Section ─────────────────────────────── */}
        <Animated.View style={[styles.hero, { opacity: fadeHero, transform: [{ translateY: slideHero }] }]}>
          <View style={styles.waveformRow}>
            <WaveformPlaceholder color={colors.primary} />
          </View>
          <Text style={styles.heroHeading}>Audio Intelligence</Text>
          <Text style={styles.heroSub}>
            Upload a file or start live — uncover every voice and sound.
          </Text>
        </Animated.View>

        {/* ── Feature Cards ────────────────────────────── */}
        <Animated.View style={[styles.featureSection, { opacity: fadeCards }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featureScroll}
          >
            {features.map((f) => (
              <GlassPanel key={f.title} style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: `${f.color}15` }]}>
                  <Text style={styles.featureEmoji}>{f.icon}</Text>
                </View>
                <Text style={styles.featureTitle}>{f.title}</Text>
              </GlassPanel>
            ))}
          </ScrollView>
        </Animated.View>

        {/* ── Selected File Indicator ──────────────────── */}
        {selectedAudio && (
          <View style={styles.filePill}>
            <Text style={styles.fileIcon}>🎵</Text>
            <Text style={styles.fileName} numberOfLines={1}>{selectedAudio.name}</Text>
            <Pressable onPress={() => setSelectedAudio(null)} style={styles.clearBtn}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          </View>
        )}

        {/* ── CTAs ─────────────────────────────────────── */}
        <Animated.View style={[styles.ctaSection, { opacity: fadeCTA, transform: [{ translateY: slideCTA }] }]}>
          <Pressable
            onPress={pickAudio}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <LinearGradient
              colors={gradients.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtnInner}
            >
              <Text style={{ fontSize: 16 }}>📁</Text>
              <Text style={styles.primaryBtnText}>Upload Audio File</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={onOpenLive}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <View style={styles.livePulseDot}>
              <Animated.View style={[styles.livePulseRing, { opacity: liveGlow }]} />
              <View style={styles.liveDotInner} />
            </View>
            <Text style={styles.secondaryBtnText}>Start Live Listening</Text>
          </Pressable>
        </Animated.View>

        {/* ── How It Works ────────────────────────────── */}
        <Animated.View style={[styles.recentSection, { opacity: fadeRecent }]}>
          <Text style={styles.recentSectionTitle}>How It Works</Text>
          {[
            { step: '1', icon: '📁', title: 'Upload or Record', desc: 'Pick an audio file or start a live session' },
            { step: '2', icon: '⚙️', title: 'AI Analysis', desc: 'Speaker diarization, transcription & sound classification' },
            { step: '3', icon: '📊', title: 'View Results', desc: 'Explore who spoke, what was said, and what sounds were detected' },
          ].map((item) => (
            <GlassPanel key={item.step} style={styles.howItWorksCard}>
              <View style={styles.howItWorksLeft}>
                <View style={styles.howItWorksStep}>
                  <Text style={styles.howItWorksStepText}>{item.step}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.howItWorksTitle}>{item.icon} {item.title}</Text>
                  <Text style={styles.howItWorksDesc}>{item.desc}</Text>
                </View>
              </View>
            </GlassPanel>
          ))}
        </Animated.View>
      </ScrollView>

      {/* ── Bottom Navigation Bar ───────────────────── */}
      <BottomNavBar activeTab="home" onNavigate={handleNavigation} />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    paddingBottom: 110,
  },

  // ── Header buttons ──────────────────────────────────────
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnIcon: { fontSize: 16 },

  // ── Hero ──────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    minHeight: 250,
  },
  heroHeading: {
    color: colors.white,
    ...typography.headlineXl,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSub: {
    color: colors.onSurfaceVariant,
    ...typography.bodyMd,
    textAlign: 'center',
    maxWidth: 300,
  },
  waveformRow: {
    height: 64,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Feature Cards ─────────────────────────────────────────
  featureSection: { marginVertical: 12 },
  featureScroll: { gap: 12, paddingRight: 20 },
  featureCard: {
    width: 130,
    height: 130,
    padding: 16,
    justifyContent: 'space-between',
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureEmoji: { fontSize: 20 },
  featureTitle: {
    color: colors.onSurface,
    ...typography.labelMd,
    lineHeight: 16,
  },

  // ── File Pill ─────────────────────────────────────────────
  filePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 12,
  },
  fileIcon: { fontSize: 14 },
  fileName: {
    color: '#A1A1AA',
    ...typography.bodySm,
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
  clearText: { color: '#52525B', fontSize: 16, fontWeight: '500', lineHeight: 18 },

  // ── CTAs ──────────────────────────────────────────────────
  ctaSection: { gap: 12, marginVertical: 16 },
  primaryBtn: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    height: 56,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: colors.white,
    ...typography.headlineMd,
    fontSize: 16,
  },
  secondaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(192, 193, 255, 0.2)',
    backgroundColor: colors.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryBtnText: { color: colors.onSurface, ...typography.headlineMd, fontSize: 16 },
  livePulseDot: { width: 10, height: 10, justifyContent: 'center', alignItems: 'center' },
  livePulseRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.error,
  },
  liveDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error },

  // ── How It Works ───────────────────────────────────────────
  recentSection: { marginVertical: 16, gap: 8 },
  recentSectionTitle: { color: colors.white, ...typography.headlineMd, fontSize: 16, marginBottom: 4 },
  howItWorksCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  howItWorksLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  howItWorksStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howItWorksStepText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  howItWorksTitle: { color: colors.onSurface, ...typography.bodySm, fontWeight: '600' },
  howItWorksDesc: { color: colors.outline, fontSize: 11, marginTop: 2 },
});
