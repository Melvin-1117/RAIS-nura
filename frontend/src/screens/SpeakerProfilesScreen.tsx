import {
  AudioModule,
  AudioQuality,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '../constants/theme';
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

  // `apiBaseUrl` is no longer required for on-device profiles, but kept in props for compatibility.
  void apiBaseUrl;

  const ENROLLMENT_SAMPLE_TARGET = 3;

  const recordingOptions: RecordingOptions = {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    android: {
      extension: '.wav',
      outputFormat: 'default',
      audioEncoder: 'default',
      sampleRate: 16000,
    },
    ios: {
      extension: '.wav',
      audioQuality: AudioQuality.HIGH,
      sampleRate: 16000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  };

  const decodeWavToFloat32 = (buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } => {
    const view = new DataView(buffer);
    const readString = (offset: number, size: number): string => {
      let out = '';
      for (let i = 0; i < size; i += 1) {
        out += String.fromCharCode(view.getUint8(offset + i));
      }
      return out;
    };

    if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') {
      throw new Error('Enrollment recording must be a WAV PCM file.');
    }

    let offset = 12;
    let audioFormat = 1;
    let channels = 1;
    let sampleRate = 16000;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataLength = 0;

    while (offset + 8 <= view.byteLength) {
      const chunkId = readString(offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;

      if (chunkId === 'fmt ') {
        audioFormat = view.getUint16(chunkStart, true);
        channels = view.getUint16(chunkStart + 2, true);
        sampleRate = view.getUint32(chunkStart + 4, true);
        bitsPerSample = view.getUint16(chunkStart + 14, true);
      } else if (chunkId === 'data') {
        dataOffset = chunkStart;
        dataLength = chunkSize;
      }

      offset = chunkStart + chunkSize + (chunkSize % 2);
    }

    if (audioFormat !== 1) {
      throw new Error('Only PCM WAV is supported for enrollment.');
    }
    if (bitsPerSample !== 16) {
      throw new Error('Only 16-bit WAV is supported for enrollment.');
    }
    if (dataOffset < 0 || dataLength <= 0) {
      throw new Error('Invalid WAV data chunk for enrollment.');
    }

    const sampleCount = Math.floor(dataLength / 2 / channels);
    const samples = new Float32Array(sampleCount);
    let writeIndex = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      let mixed = 0;
      for (let c = 0; c < channels; c += 1) {
        const pcm = view.getInt16(dataOffset + (i * channels + c) * 2, true);
        mixed += pcm / 32768;
      }
      samples[writeIndex] = mixed / channels;
      writeIndex += 1;
    }

    return { samples, sampleRate };
  };

  const loadWavFromUri = async (uri: string): Promise<Float32Array> => {
    const response = await fetch(uri);
    const buf = await response.arrayBuffer();
    const decoded = decodeWavToFloat32(buf);

    if (decoded.sampleRate !== 16000) {
      // The embedding service can resample, so only keep this as informational.
      console.warn(`Enrollment sample rate is ${decoded.sampleRate}, resampling to 16k in embedding service.`);
    }

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
    if (Platform.OS === 'web') {
      Alert.alert('Recording is not supported on web in this build.');
      return;
    }

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
      setSampleAudios((prev) => {
        if (prev.length >= ENROLLMENT_SAMPLE_TARGET) {
          return prev;
        }
        return [...prev, audio];
      });
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
      setNewName('');
      setSampleAudios([]);
      setIsEnrollModalOpen(false);
      Alert.alert('Speaker enrolled', `${profile.name} is ready for recognition.`);
    } catch (error: unknown) {
      Alert.alert('Enrollment failed', String((error as Error)?.message ?? error));
    } finally {
      setLoading(false);
    }
  };

  const deleteProfile = (id: string) => {
    removeProfile(id);
  };

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Speaker Profiles</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{profiles.length}</Text>
        </View>
      </View>

      <View style={styles.addCard}>
        <Text style={styles.sectionLabel}>Enrollment</Text>
        <Pressable
          onPress={() => {
            setNewName('');
            setSampleAudios([]);
            setIsEnrollModalOpen(true);
          }}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.addBtnText}>Add Speaker</Text>
        </Pressable>
        <Text style={styles.fieldHint}>
          {isReady ? 'Model ready for enrollment' : 'Loading ECAPA model...'}
        </Text>
      </View>

      {/* Profiles list */}
      <View style={styles.listHeader}>
        <Text style={styles.sectionLabel}>Saved Profiles</Text>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No speakers enrolled yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{item.name}</Text>
              <Text style={styles.profileMeta}>
                {item.embeddings.length} samples · updated {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable
              onPress={() => deleteProfile(item.id)}
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </Pressable>
          </View>
        )}
      />

      {loading ? (
        <View style={styles.loadingRow}>
          <Text style={styles.loadingText}>Processing enrollment...</Text>
        </View>
      ) : null}

      <Modal visible={isEnrollModalOpen} transparent animationType="fade" onRequestClose={() => setIsEnrollModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Enroll Speaker</Text>

            <TextInput
              value={newName}
              onChangeText={setNewName}
              style={[styles.input, inputFocused && styles.inputFocused]}
              placeholder="Speaker name"
              placeholderTextColor={theme.textMuted}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />

            <Text style={styles.profileMeta}>
              Sample {Math.min(sampleAudios.length + 1, ENROLLMENT_SAMPLE_TARGET)} of {ENROLLMENT_SAMPLE_TARGET}
            </Text>

            {!recording ? (
              <Pressable onPress={startRecording} style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.7 }]}> 
                <Animated.View style={[styles.recDot, { opacity: 1 }]} />
                <Text style={styles.recordBtnText}>Record sample</Text>
              </Pressable>
            ) : (
              <Pressable onPress={stopRecording} style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.7 }]}> 
                <Animated.View style={[styles.recDot, { backgroundColor: theme.danger, opacity: pulseAnim }]} />
                <Text style={styles.stopBtnText}>Stop recording</Text>
              </Pressable>
            )}

            <View style={styles.sampleReadyRow}>
              {Array.from({ length: ENROLLMENT_SAMPLE_TARGET }).map((_, idx) => (
                <View key={idx} style={[styles.samplePill, idx < sampleAudios.length && styles.samplePillReady]}>
                  <Text style={[styles.samplePillText, idx < sampleAudios.length && styles.samplePillTextReady]}>
                    {idx + 1}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setIsEnrollModalOpen(false)}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.backBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={addProfile}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.addBtnText}>Enroll</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: theme.textMuted, fontSize: 14, fontWeight: '500' },
  screenTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '700', flex: 1 },
  countPill: {
    minWidth: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  countText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },

  addCard: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  fieldHint: { color: theme.textMuted, fontSize: 12, marginTop: 8 },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  input: {
    color: theme.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    fontSize: 14,
    marginBottom: 10,
  },
  inputFocused: { borderColor: theme.accent },

  recordRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  recordBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 11, borderRadius: theme.radius.md,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },
  recordBtnText: { color: theme.textPrimary, fontSize: 14, fontWeight: '500' },
  stopBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 11, borderRadius: theme.radius.md,
    backgroundColor: `${theme.danger}12`,
    borderWidth: 1, borderColor: `${theme.danger}30`,
  },
  stopBtnText: { color: theme.danger, fontSize: 14, fontWeight: '500' },
  addBtn: {
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: theme.radius.md,
    backgroundColor: theme.accent,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  sampleReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sampleDot: { width: 6, height: 6, borderRadius: 3 },
  sampleText: { color: theme.accentGreen, fontSize: 12, fontWeight: '500' },
  samplePill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  samplePillReady: {
    borderColor: `${theme.accentGreen}66`,
    backgroundColor: `${theme.accentGreen}22`,
  },
  samplePillText: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  samplePillTextReady: { color: theme.accentGreen },

  listHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 48 },

  emptyRow: { paddingVertical: 36, alignItems: 'center' },
  emptyText: { color: theme.textMuted, fontSize: 14 },

  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: 14,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${theme.accent}20`,
    borderWidth: 1, borderColor: `${theme.accent}30`,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: theme.accent, fontWeight: '700', fontSize: 14 },
  profileInfo: { flex: 1 },
  profileName: { color: theme.textPrimary, fontWeight: '600', fontSize: 14 },
  profileMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: `${theme.danger}30`,
    backgroundColor: `${theme.danger}10`,
  },
  deleteText: { color: theme.danger, fontSize: 12, fontWeight: '600' },

  loadingRow: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: theme.background,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
});
