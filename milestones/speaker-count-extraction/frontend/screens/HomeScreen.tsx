import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { theme } from '../constants/theme';
import { PickedAudio } from '../types/app';

type HomeScreenProps = {
  onStartProcess: (audio: PickedAudio) => void;
  onOpenLive: () => void;
  onOpenProfiles: () => void;
  onOpenSettings: () => void;
};

export const HomeScreen = ({
  onStartProcess,
  onOpenLive,
  onOpenProfiles,
  onOpenSettings,
}: HomeScreenProps) => {
  const [selectedAudio, setSelectedAudio] = useState<PickedAudio | null>(null);
  const [recording, setRecording] = useState<AudioRecorder | null>(null);

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
        {/* Brand header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <View style={styles.logoBar1} />
              <View style={styles.logoBar2} />
              <View style={styles.logoBar3} />
            </View>
            <Text style={styles.logoText}>Audio Intelligence</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Phase 1 · M1–M7</Text>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroHeading}>
            Understand{'\n'}
            <Text style={styles.heroAccent}>who said what.</Text>
          </Text>
          <Text style={styles.heroSub}>
            Upload or record audio. Get speaker-aware transcripts, sound classification, and intelligence — instantly.
          </Text>
        </View>

        {/* Audio Input Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Audio Source</Text>
            {selectedAudio && (
              <View style={styles.readyPill}>
                <View style={styles.readyDot} />
                <Text style={styles.readyText}>Ready</Text>
              </View>
            )}
          </View>

          <View style={styles.waveformRow}>
            <WaveformPlaceholder color={theme.accent} />
          </View>

          {selectedAudio ? (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <View style={styles.fileIconDot} />
              </View>
              <Text style={styles.fileName} numberOfLines={1}>{selectedAudio.name}</Text>
              <Pressable onPress={() => setSelectedAudio(null)} style={styles.clearBtn}>
                <Text style={styles.clearText}>×</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.noFile}>No file selected</Text>
          )}

          <View style={styles.actionRow}>
            <Pressable
              onPress={pickAudio}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.secondaryBtnText}>Upload file</Text>
            </Pressable>

            {!recording ? (
              <Pressable
                onPress={startRecording}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              >
                <View style={styles.recDot} />
                <Text style={styles.secondaryBtnText}>Record</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={stopRecording}
                style={({ pressed }) => [styles.secondaryBtn, styles.secondaryBtnDanger, pressed && styles.btnPressed]}
              >
                <View style={styles.stopSquare} />
                <Text style={[styles.secondaryBtnText, { color: theme.danger }]}>Stop</Text>
              </Pressable>
            )}
          </View>

        </View>

        {/* Navigation */}
        <View style={styles.navSection}>
          <Text style={styles.navLabel}>More</Text>
          <View style={styles.navList}>
            <Pressable
              onPress={onOpenLive}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <View style={styles.navItemContent}>
                <View style={[styles.navIcon, { backgroundColor: `${theme.danger}20`, borderColor: `${theme.danger}30` }]}>
                  <View style={[styles.navIconDot, { backgroundColor: theme.danger }]} />
                </View>
                <View style={styles.navTextGroup}>
                  <Text style={styles.navItemTitle}>Live Listening</Text>
                  <Text style={styles.navItemSub}>Real-time · M8</Text>
                </View>
              </View>
              <Text style={styles.navChevron}>›</Text>
            </Pressable>

            <View style={styles.navDivider} />

            <Pressable
              onPress={onOpenProfiles}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <View style={styles.navItemContent}>
                <View style={[styles.navIcon, { backgroundColor: `${theme.accent}20`, borderColor: `${theme.accent}30` }]}>
                  <View style={[styles.navIconDot, { backgroundColor: theme.accent }]} />
                </View>
                <View style={styles.navTextGroup}>
                  <Text style={styles.navItemTitle}>Speaker Profiles</Text>
                  <Text style={styles.navItemSub}>Recognition · M3</Text>
                </View>
              </View>
              <Text style={styles.navChevron}>›</Text>
            </Pressable>

            <View style={styles.navDivider} />

            <Pressable
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            >
              <View style={styles.navItemContent}>
                <View style={[styles.navIcon, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: theme.border }]}>
                  <View style={[styles.navIconDot, { backgroundColor: theme.textMuted }]} />
                </View>
                <View style={styles.navTextGroup}>
                  <Text style={styles.navItemTitle}>Settings</Text>
                  <Text style={styles.navItemSub}>API & config</Text>
                </View>
              </View>
              <Text style={styles.navChevron}>›</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
  },

  // Header / brand
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  logoBar1: { width: 3, height: 12, borderRadius: 2, backgroundColor: theme.accent },
  logoBar2: { width: 3, height: 20, borderRadius: 2, backgroundColor: theme.accent },
  logoBar3: { width: 3, height: 14, borderRadius: 2, backgroundColor: theme.accent },
  logoText: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  pillText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },

  // Hero
  hero: {
    marginBottom: 28,
  },
  heroHeading: {
    color: theme.textPrimary,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 46,
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
  },

  // Card
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    marginBottom: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  readyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: `${theme.accentGreen}15`,
    borderWidth: 1,
    borderColor: `${theme.accentGreen}35`,
  },
  readyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accentGreen },
  readyText: { color: theme.accentGreen, fontSize: 11, fontWeight: '600' },

  // Waveform
  waveformRow: {
    marginBottom: 12,
  },

  // File
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  fileIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: `${theme.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },
  fileName: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  clearBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: theme.textMuted,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 20,
  },
  noFile: {
    color: theme.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },

  // Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderLight,
    backgroundColor: theme.surface,
    paddingVertical: 11,
  },
  secondaryBtnDanger: {
    borderColor: `${theme.danger}40`,
    backgroundColor: `${theme.danger}10`,
  },
  secondaryBtnText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '500',
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
  primaryBtn: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.accent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnPressed: {
    opacity: 0.75,
  },

  // Navigation section
  navSection: {
    marginBottom: 8,
  },
  navLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  navList: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  navItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  navItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  navIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  navTextGroup: {
    gap: 2,
  },
  navItemTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  navItemSub: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '400',
  },
  navChevron: {
    color: theme.textMuted,
    fontSize: 20,
    fontWeight: '300',
  },
  navDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginHorizontal: 18,
  },
});
