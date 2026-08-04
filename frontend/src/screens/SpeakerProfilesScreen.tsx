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
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { TopAppBar } from '../components/TopAppBar';
import { colors, gradients, radius, spacing, speakerPalette, typography } from '../constants/theme';
import {
  deleteSpeakerProfile,
  listSpeakerProfiles,
  registerSpeakerProfile,
} from '../services/api';
import { SpeakerProfile } from '../types/profiles';

type SpeakerProfilesScreenProps = {
  apiBaseUrl: string;
  onBack: () => void;
};

const MIN_RECORDING_SECONDS = 5;

export const SpeakerProfilesScreen = ({ apiBaseUrl, onBack }: SpeakerProfilesScreenProps) => {
  const [profiles, setProfiles] = useState<SpeakerProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [recording, setRecording] = useState<AudioRecorder | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchingProfiles, setFetchingProfiles] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const recordingOptions: RecordingOptions = {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    android: { extension: '.wav', outputFormat: 'default', audioEncoder: 'default', sampleRate: 16000 },
    ios: {
      extension: '.wav',
      audioQuality: AudioQuality.HIGH,
      sampleRate: 16000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  };

  const loadProfiles = async () => {
    setFetchingProfiles(true);
    try {
      const fetched = await listSpeakerProfiles(apiBaseUrl);
      setProfiles(fetched);
    } catch (err: any) {
      console.warn('Failed to fetch speaker profiles from backend:', err?.message || err);
    } finally {
      setFetchingProfiles(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!recording) {
      pulseAnim.setValue(1);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    setRecordingSeconds(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    pulse.start();

    return () => {
      pulse.stop();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [recording, pulseAnim]);

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Recording is not supported on web in this build.');
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone permission required.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const audioModuleAny = AudioModule as any;
    const rec: AudioRecorder = audioModuleAny?.createAudioRecorder
      ? audioModuleAny.createAudioRecorder(recordingOptions)
      : new audioModuleAny.AudioRecorder(recordingOptions);
    await rec.prepareToRecordAsync();
    rec.record();
    setRecording(rec);
    setRecordedUri(null);
  };

  const stopRecording = async () => {
    if (!recording) return;

    if (recordingSeconds < MIN_RECORDING_SECONDS) {
      Alert.alert(
        'Sample too short',
        'Please record at least 30 seconds for reliable recognition.'
      );
      await recording.stop();
      setRecording(null);
      setRecordingSeconds(0);
      setRecordedUri(null);
      return;
    }

    await recording.stop();
    const uri = recording.uri;
    setRecording(null);
    if (uri) {
      setRecordedUri(uri);
    }
  };

  const handleEnroll = async () => {
    if (!newName.trim()) {
      Alert.alert('Missing Name', 'Please enter a speaker name.');
      return;
    }
    if (!recordedUri) {
      Alert.alert('Missing Recording', 'Please record a voice sample first.');
      return;
    }
    if (recordingSeconds < MIN_RECORDING_SECONDS) {
      Alert.alert('Sample Too Short', 'Please record at least 30 seconds for reliable recognition.');
      return;
    }

    setLoading(true);
    try {
      const uriParts = recordedUri.split('.');
      const ext = uriParts.length > 1 ? uriParts[uriParts.length - 1].toLowerCase() : 'wav';
      const sampleName = `voice_sample.${ext}`;
      const sampleMime = ext === 'm4a' ? 'audio/x-m4a' : ext === 'mp4' ? 'audio/mp4' : 'audio/wav';

      await registerSpeakerProfile(
        apiBaseUrl,
        newName.trim(),
        recordedUri,
        sampleName,
        sampleMime
      );
      setNewName('');
      setRecordedUri(null);
      setRecordingSeconds(0);
      setIsEnrollModalOpen(false);
      await loadProfiles();
      Alert.alert('Success', 'Speaker enrolled successfully!');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to register speaker';
      Alert.alert('Enrollment Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = (profileId: string, name: string) => {
    Alert.alert(
      'Remove Profile',
      `Are you sure you want to delete profile for "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSpeakerProfile(apiBaseUrl, profileId);
              await loadProfiles();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete profile');
            }
          },
        },
      ]
    );
  };

  const handleNavigation = (tab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (tab !== 'profiles') onBack();
  };

  const progressRatio = Math.min(1.0, recordingSeconds / MIN_RECORDING_SECONDS);

  return (
    <View style={styles.container}>
      {/* Header */}
      <TopAppBar
        variant="back"
        title="Speaker Profiles"
        onBack={onBack}
        rightElement={
          <Pressable
            onPress={() => {
              setNewName('');
              setRecordedUri(null);
              setRecordingSeconds(0);
              setIsEnrollModalOpen(true);
            }}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        }
      />

      {/* Status Banner */}
      <View style={styles.statusRow}>
        <View style={styles.statusPulseContainer}>
          <View style={[styles.statusPulseOuter, { backgroundColor: colors.tertiary }]} />
          <View style={[styles.statusDot, { backgroundColor: colors.tertiary }]} />
        </View>
        <Text style={styles.statusText}>Offline MFCC Speaker Engine Active</Text>
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Registered Voice Profiles ({profiles.length})</Text>
      </View>

      {/* Profiles List */}
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshing={fetchingProfiles}
        onRefresh={loadProfiles}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Text style={{ fontSize: 32, color: colors.outline }}>👤</Text>
            </View>
            <Text style={styles.emptyTitle}>No speakers registered yet</Text>
            <Text style={styles.emptySubtitle}>
              Pre-register known speakers with a 5-second voice sample for offline speaker identification.
            </Text>
            <Pressable
              onPress={() => {
                setNewName('');
                setRecordedUri(null);
                setRecordingSeconds(0);
                setIsEnrollModalOpen(true);
              }}
              style={({ pressed }) => [styles.enrollEmptyBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <LinearGradient
                colors={gradients.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.enrollEmptyBtnInner}
              >
                <Text style={{ fontSize: 14 }}>👤</Text>
                <Text style={styles.enrollEmptyBtnText}>Add Speaker Profile</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => {
          const profileColor = speakerPalette[index % speakerPalette.length];
          const duration = item.sample_duration_seconds ? `${Math.round(item.sample_duration_seconds)}s sample` : '30s+ sample';
          return (
            <View style={styles.profileCard}>
              <View style={styles.profileLeft}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: `${profileColor}15`, borderColor: `${profileColor}20` },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: profileColor }]}>👤</Text>
                </View>
                <View>
                  <Text style={styles.profileName}>{item.name}</Text>
                  <View style={styles.profileMetaRow}>
                    <Text style={styles.profileMeta}>{duration}</Text>
                    <View style={[styles.metaDot, { backgroundColor: colors.outlineVariant }]} />
                    <View style={[styles.colorTag, { backgroundColor: `${profileColor}15` }]}>
                      <Text style={[styles.colorTagText, { color: profileColor }]}>ENROLLED</Text>
                    </View>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => handleDeleteProfile(item.id, item.name)}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.deleteIcon}>🗑️</Text>
              </Pressable>
            </View>
          );
        }}
      />

      {/* Enrollment Modal */}
      <Modal
        visible={isEnrollModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEnrollModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Speaker Profile</Text>
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
                placeholder="e.g. Alice, Bob"
                placeholderTextColor={colors.outline}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
              />

              {/* Progress Bar & Timer */}
              <View style={styles.timerRow}>
                <Text style={styles.timerText}>
                  Recording Duration: {recordingSeconds}s / {MIN_RECORDING_SECONDS}s
                </Text>
                {recordedUri && <Text style={styles.sampleReadyText}>✓ Sample Ready</Text>}
              </View>

              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.round(progressRatio * 100)}%`,
                      backgroundColor:
                        recordingSeconds >= MIN_RECORDING_SECONDS ? colors.tertiary : colors.primary,
                    },
                  ]}
                />
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
                  {recording
                    ? recordingSeconds < MIN_RECORDING_SECONDS
                      ? `Keep speaking... (${MIN_RECORDING_SECONDS - recordingSeconds}s remaining)`
                      : 'Target duration reached! Tap stop when finished.'
                    : recordedUri
                    ? 'Sample recorded! Tap Enroll to register.'
                    : 'Tap microphone and record a voice sample for at least 5 seconds.'}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleEnroll}
              disabled={loading || !recordedUri || recordingSeconds < MIN_RECORDING_SECONDS}
              style={({ pressed }) => [
                styles.enrollCta,
                (!recordedUri || recordingSeconds < MIN_RECORDING_SECONDS || loading) && { opacity: 0.4 },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
            >
              <LinearGradient
                colors={
                  !recordedUri || recordingSeconds < MIN_RECORDING_SECONDS
                    ? ['rgba(99,102,241,0.2)', 'rgba(79,70,229,0.2)']
                    : gradients.button
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.enrollCtaInner}
              >
                <Text
                  style={[
                    styles.enrollCtaText,
                    (!recordedUri || recordingSeconds < MIN_RECORDING_SECONDS) && { color: colors.outline },
                  ]}
                >
                  {loading ? 'Registering...' : 'Enroll Speaker Profile'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Bottom Nav */}
      <BottomNavBar activeTab="profiles" onNavigate={handleNavigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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

  sectionHeader: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sectionLabel: { ...typography.labelMd, color: colors.outline, textTransform: 'uppercase', letterSpacing: 1.2 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 110, gap: spacing.sm },

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
  timerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerText: { ...typography.bodySm, color: colors.onSurfaceVariant, fontFamily: 'monospace' },
  sampleReadyText: { fontSize: 12, color: colors.tertiary, fontWeight: '700' },
  progressBarTrack: { height: 6, backgroundColor: colors.surfaceContainerHighest, borderRadius: radius.pill, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: radius.pill },
  recordContainer: { alignItems: 'center', gap: 12, marginTop: spacing.sm },
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
