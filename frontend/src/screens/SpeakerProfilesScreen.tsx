import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { storageKeys } from '../constants/storage';
import { theme } from '../constants/theme';
import { SpeakerProfile } from '../types/profiles';

type SpeakerProfilesScreenProps = { onBack: () => void };

export const SpeakerProfilesScreen = ({ onBack }: SpeakerProfilesScreenProps) => {
  const [profiles, setProfiles] = useState<SpeakerProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [recording, setRecording] = useState<AudioRecorder | null>(null);
  const [sampleUri, setSampleUri] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) { pulseAnim.setValue(1); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [recording, pulseAnim]);

  useEffect(() => {
    const load = async () => {
      const raw = await AsyncStorage.getItem(storageKeys.speakerProfiles);
      if (raw) setProfiles(JSON.parse(raw));
    };
    load();
  }, []);

  const persist = async (items: SpeakerProfile[]) => {
    setProfiles(items);
    await AsyncStorage.setItem(storageKeys.speakerProfiles, JSON.stringify(items));
  };

  const startRecording = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required.'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const rec = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await rec.prepareToRecordAsync();
    rec.record();
    setRecording(rec);
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stop();
    const uri = recording.uri;
    setRecording(null);
    if (uri) setSampleUri(uri);
  };

  const addProfile = async () => {
    if (!newName.trim()) { Alert.alert('Enter speaker name first.'); return; }
    if (!sampleUri) { Alert.alert('Record a voice sample first.'); return; }
    const profile: SpeakerProfile = {
      id: `${Date.now()}`, name: newName.trim(),
      sampleUri, createdAt: new Date().toISOString(),
    };
    await persist([profile, ...profiles]);
    setNewName(''); setSampleUri('');
  };

  const deleteProfile = async (id: string) => {
    await persist(profiles.filter((p) => p.id !== id));
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

      {/* Add profile form */}
      <View style={styles.addCard}>
        <Text style={styles.sectionLabel}>Add Speaker</Text>

        <TextInput
          value={newName}
          onChangeText={setNewName}
          style={[styles.input, inputFocused && styles.inputFocused]}
          placeholder="Speaker name (e.g. Alice)"
          placeholderTextColor={theme.textMuted}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
        />

        <View style={styles.recordRow}>
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

          <Pressable
            onPress={addProfile}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.addBtnText}>Save</Text>
          </Pressable>
        </View>

        {sampleUri ? (
          <View style={styles.sampleReadyRow}>
            <View style={[styles.sampleDot, { backgroundColor: theme.accentGreen }]} />
            <Text style={styles.sampleText}>Sample recorded</Text>
          </View>
        ) : null}
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
            <Text style={styles.emptyText}>No profiles yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{item.name}</Text>
              <Text style={styles.profileMeta}>Added {new Date(item.createdAt).toLocaleDateString()}</Text>
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
});
