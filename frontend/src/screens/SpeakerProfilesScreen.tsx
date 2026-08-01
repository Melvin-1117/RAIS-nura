import {
  AudioModule,
  AudioQuality,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { colors, gradients, radius, spacing, speakerPalette, typography } from '../constants/theme';
import { useSpeakerRecognition } from '../hooks/useSpeakerRecognition';
import { SpeakerProfile } from '../types/profiles';

type SpeakerProfilesScreenProps = {
  apiBaseUrl: string;
  onBack: () => void;
};

export const SpeakerProfilesScreen = ({ apiBaseUrl, onBack }: SpeakerProfilesScreenProps) => {
  const { profiles, enrollSpeaker, removeProfile, isReady } = useSpeakerRecognition();
  const [newName, setNewName] = useState('');
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [sampleAudios, setSampleAudios] = useState<Float32Array[]>([]);
  const [recording, setRecording] = useState<AudioRecorder | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  void apiBaseUrl;

  const ENROLLMENT_SAMPLE_TARGET = 3;

  const recordingOptions: RecordingOptions = {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    android: { extension: '.wav', outputFormat: 'default', audioEncoder: 'default', sampleRate: 16000 },
    ios: { extension: '.wav', audioQuality: AudioQuality.HIGH, sampleRate: 16000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  };

  const decodeWavToFloat32 = (buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } => {
    const view = new DataView(buffer);
    const readString = (offset: number, size: number): string => {
      let out = '';
      for (let i = 0; i < size; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
      return out;
    };
    if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') throw new Error('Enrollment recording must be a WAV PCM file.');
    let offset = 12;
    let audioFormat = 1, channels = 1, sampleRate = 16000, bitsPerSample = 16, dataOffset = -1, dataLength = 0;
    while (offset + 8 <= view.byteLength) {
      const chunkId = readString(offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      if (chunkId === 'fmt ') {
        audioFormat = view.getUint16(chunkStart, true);
        channels = view.getUint16(chunkStart + 2, true);
        sampleRate = view.getUint32(chunkStart + 4, true);
        bitsPerSample = view.getUint16(chunkStart + 14, true);
      } else if (chunkId === 'data') { dataOffset = chunkStart; dataLength = chunkSize; }
      offset = chunkStart + chunkSize + (chunkSize % 2);
    }
    if (audioFormat !== 1) throw new Error('Only PCM WAV is supported for enrollment.');
    if (bitsPerSample !== 16) throw new Error('Only 16-bit WAV is supported for enrollment.');
    if (dataOffset < 0 || dataLength <= 0) throw new Error('Invalid WAV data chunk for enrollment.');
    const sampleCount = Math.floor(dataLength / 2 / channels);
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      let mixed = 0;
      for (let c = 0; c < channels; c += 1) mixed += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 32768;
      samples[i] = mixed / channels;
    }
    return { samples, sampleRate };
  };

  const loadWavFromUri = async (uri: string): Promise<Float32Array> => {
    const response = await fetch(uri);
    const buf = await response.arrayBuffer();
    const decoded = decodeWavToFloat32(buf);
    if (decoded.sampleRate !== 16000) console.warn(`Enrollment sample rate is ${decoded.sampleRate}, resampling to 16k in embedding service.`);
    return decoded.samples;
  };

  useEffect(() => {
    if (!recording) { pulseAnim.setValue(1); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [recording, pulseAnim]);

  const startRecording = async () => {
    if (Platform.OS === 'web') { Alert.alert('Recording is not supported on web in this build.'); return; }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required.'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const audioModuleAny = AudioModule as any;
    const rec: AudioRecorder = audioModuleAny?.createAudioRecorder
      ? audioModuleAny.createAudioRecorder(recordingOptions)
      : new audioModuleAny.AudioRecorder(recordingOptions);
    await rec.prepareToRecordAsync();
    rec.record();
    setRecording(rec);
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stop();
    const uri = recording.uri;
    setRecording(null);
    if (!uri) return;
    try {
      const audio = await loadWavFromUri(uri);
      setSampleAudios((prev) => prev.length >= ENROLLMENT_SAMPLE_TARGET ? prev : [...prev, audio]);
    } catch (error: unknown) {
      Alert.alert('Invalid sample', String((error as Error)?.message ?? error));
    }
  };

  const addProfile = async () => {
    if (!newName.trim()) { Alert.alert('Enter speaker name first.'); return; }
    if (sampleAudios.length < ENROLLMENT_SAMPLE_TARGET) {
      Alert.alert(`Record ${ENROLLMENT_SAMPLE_TARGET} samples before enrolling.`);
      return;
    }
    if (!isReady) {
      Alert.alert('Model is still loading', 'Wait for the ECAPA model to be ready and retry.');
      return;
    }
    setLoading(true);
    try {
      const profile = await enrollSpeaker(newName.trim(), sampleAudios, 16000);
      setNewName(''); setSampleAudios([]); setIsEnrollModalOpen(false);
      Alert.alert('Speaker enrolled', `${profile.name} is ready for recognition.`);
    } catch (error: unknown) {
      Alert.alert('Enrollment failed', String((error as Error)?.message ?? error));
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const handleNavigation = (tab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (tab !== 'profiles') onBack();
  };

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <TopAppBar
        variant="back"
        title="Speaker Profiles"
        onBack={onBack}
        rightElement={
          <Pressable
            onPress={() => { setNewName(''); setSampleAudios([]); setIsEnrollModalOpen(true); }}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        }
      />

      {/* ── Status Row ─────────────────────────────────────── */}
      <View style={styles.statusRow}>
        <View style={styles.statusPulseContainer}>
          <View style={[styles.statusPulseOuter, { backgroundColor: isReady ? colors.tertiary : colors.error }]} />
          <View style={[styles.statusDot, { backgroundColor: isReady ? colors.tertiary : colors.error }]} />
        </View>
        <Text style={styles.statusText}>{isReady ? 'Model Ready' : 'Loading model...'}</Text>
      </View>

      {/* ── Section Header ─────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Enrolled Entities ({profiles.length})</Text>
      </View>

      {/* ── Profiles List ──────────────────────────────────── */}
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Text style={{ fontSize: 32, color: colors.outline }}>👤</Text>
            </View>
            <Text style={styles.emptyTitle}>No Profiles Yet</Text>
            <Text style={styles.emptySubtitle}>
              Enroll your first speaker to enable real-time speaker identification and analytics.
            </Text>
            <Pressable
              onPress={() => { setNewName(''); setSampleAudios([]); setIsEnrollModalOpen(true); }}
              style={({ pressed }) => [styles.enrollEmptyBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <LinearGradient colors={gradients.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.enrollEmptyBtnInner}>
                <Text style={{ fontSize: 14 }}>👤</Text>
                <Text style={styles.enrollEmptyBtnText}>Enroll Speaker</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => {
          const profileColor = speakerPalette[index % speakerPalette.length];
          return (
            <View style={styles.profileCard}>
              <View style={styles.profileLeft}>
                <View style={[styles.avatar, { backgroundColor: `${profileColor}15`, borderColor: `${profileColor}20` }]}>
                  <Text style={[styles.avatarText, { color: profileColor }]}>👤</Text>
                </View>
                <View>
                  <Text style={styles.profileName}>{item.name}</Text>
                  <View style={styles.profileMetaRow}>
                    <Text style={styles.profileMeta}>{item.embeddings.length} samples</Text>
                    <View style={[styles.metaDot, { backgroundColor: colors.outlineVariant }]} />
                    <View style={[styles.colorTag, { backgroundColor: `${profileColor}10` }]}>
                      <Text style={[styles.colorTagText, { color: profileColor }]}>
                        {profileColor === speakerPalette[0] ? 'Indigo' : profileColor === speakerPalette[2] ? 'Green' : 'Tag'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => removeProfile(item.id)}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.deleteIcon}>🗑️</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {loading && (
        <View style={styles.loadingBar}>
          <Text style={styles.loadingText}>Processing enrollment...</Text>
        </View>
      )}

      {/* ── Enrollment Modal ───────────────────────────────── */}
      <Modal visible={isEnrollModalOpen} transparent animationType="fade" onRequestClose={() => setIsEnrollModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enroll Speaker</Text>
              <Pressable onPress={() => setIsEnrollModalOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>Speaker Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                style={[styles.input, inputFocused && styles.inputFocused]}
                placeholder="Enter speaker name"
                placeholderTextColor={colors.outline}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
              />

              <View style={styles.samplesHeader}>
                <Text style={styles.samplesText}>Samples: {sampleAudios.length} / {ENROLLMENT_SAMPLE_TARGET}</Text>
                <View style={styles.dotsRow}>
                  {Array.from({ length: ENROLLMENT_SAMPLE_TARGET }).map((_, idx) => (
                    <View key={idx} style={[styles.progressDot, idx < sampleAudios.length && styles.progressDotReady]} />
                  ))}
                </View>
              </View>

              <View style={styles.recordContainer}>
                {!recording ? (
                  <Pressable onPress={startRecording} style={({ pressed }) => [styles.micBtn, pressed && { opacity: 0.8 }]}>
                    <Text style={{ fontSize: 28 }}>🎙️</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={stopRecording} style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.8 }]}>
                    <Animated.View style={[styles.stopInner, { transform: [{ scale: pulseAnim }] }]}>
                      <View style={styles.stopSquare} />
                    </Animated.View>
                  </Pressable>
                )}
                <Text style={styles.recordHint}>
                  {recording ? 'Recording sample...' : 'Tap to record a 3–5 second voice sample. Record 3 samples for accuracy.'}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={addProfile}
              disabled={sampleAudios.length < ENROLLMENT_SAMPLE_TARGET}
              style={({ pressed }) => [
                styles.enrollCta,
                sampleAudios.length < ENROLLMENT_SAMPLE_TARGET && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <LinearGradient
                colors={sampleAudios.length < ENROLLMENT_SAMPLE_TARGET ? ['rgba(99,102,241,0.2)', 'rgba(79,70,229,0.2)'] : gradients.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.enrollCtaInner}
              >
                <Text style={[styles.enrollCtaText, sampleAudios.length < ENROLLMENT_SAMPLE_TARGET && { color: colors.outline }]}>
                  Enroll Speaker
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Bottom Nav ─────────────────────────────────────── */}
      <BottomNavBar activeTab="profiles" onNavigate={handleNavigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Add button
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: { color: colors.onPrimary, ...typography.labelMd, fontWeight: '700' },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLow,
    padding: 16,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusPulseContainer: { width: 12, height: 12, justifyContent: 'center', alignItems: 'center' },
  statusPulseOuter: { position: 'absolute', width: 12, height: 12, borderRadius: 6, opacity: 0.5 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { ...typography.bodyMd, color: colors.onSurfaceVariant },

  // Section header
  sectionHeader: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sectionLabel: { ...typography.labelMd, color: colors.outline, textTransform: 'uppercase', letterSpacing: 1.2 },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 110, gap: spacing.sm },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    marginTop: spacing.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { ...typography.headlineMd, color: colors.onSurface, marginBottom: 8 },
  emptySubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', maxWidth: 280, marginBottom: spacing.lg },
  enrollEmptyBtn: { borderRadius: radius.pill, overflow: 'hidden' },
  enrollEmptyBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 14 },
  enrollEmptyBtnText: { color: colors.white, ...typography.headlineMd, fontSize: 16 },

  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24 },
  profileName: { ...typography.headlineMd, color: colors.onSurface },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  profileMeta: { ...typography.bodySm, color: colors.onSurfaceVariant },
  metaDot: { width: 4, height: 4, borderRadius: 2 },
  colorTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  colorTagText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  deleteBtn: { padding: 12, borderRadius: radius.xl },
  deleteIcon: { fontSize: 18 },

  // Loading
  loadingBar: { paddingVertical: 8, alignItems: 'center' },
  loadingText: { ...typography.bodySm, color: colors.onSurfaceVariant },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.headlineLg, color: colors.onSurface },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.outline, fontSize: 20, fontWeight: '500' },
  modalContent: { padding: spacing.lg, gap: spacing.md },
  modalLabel: { ...typography.labelMd, color: colors.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 4 },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  inputFocused: { borderColor: 'rgba(192, 193, 255, 0.5)' },
  samplesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  samplesText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  dotsRow: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surfaceContainerHighest, borderWidth: 1, borderColor: colors.border },
  progressDotReady: { backgroundColor: colors.tertiary, borderColor: colors.tertiary },
  recordContainer: { alignItems: 'center', gap: 12 },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 180, 171, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInner: { alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 20, height: 20, borderRadius: 4, backgroundColor: colors.error },
  recordHint: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center', maxWidth: 260 },
  enrollCta: { margin: spacing.lg, borderRadius: radius.pill, overflow: 'hidden' },
  enrollCtaInner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  enrollCtaText: { color: colors.white, ...typography.headlineMd, fontSize: 16 },
});
