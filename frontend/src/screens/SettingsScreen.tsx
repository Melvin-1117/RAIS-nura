import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { storageKeys } from '../constants/storage';
import { theme } from '../constants/theme';
import { AppSettings } from '../types/app';

const FIXED_API_BASE_URL = 'http://localhost:8002';

type SettingsScreenProps = {
  initialSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
};

export const SettingsScreen = ({ initialSettings, onSave, onBack }: SettingsScreenProps) => {
  const [apiBaseUrl, setApiBaseUrl] = useState(initialSettings.apiBaseUrl);
  const [speakerThreshold, setSpeakerThreshold] = useState(String(initialSettings.speakerMatchThreshold));
  const [chunkSize, setChunkSize] = useState(String(initialSettings.chunkSizeSeconds));
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const raw = await AsyncStorage.getItem(storageKeys.appSettings);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AppSettings;
      const migratedApiBaseUrl =
        parsed.apiBaseUrl === 'http://localhost:8000' ||
        parsed.apiBaseUrl === 'http://localhost:8001'
          ? FIXED_API_BASE_URL
          : parsed.apiBaseUrl;
      setApiBaseUrl(migratedApiBaseUrl);
      setSpeakerThreshold(String(parsed.speakerMatchThreshold));
      setChunkSize(String(parsed.chunkSizeSeconds));
    };
    load();
  }, []);

  const save = async () => {
    const rawApiBaseUrl = apiBaseUrl.trim();
    const parsedThreshold = Number(speakerThreshold);
    const parsedChunk = Number(chunkSize);

    if (!rawApiBaseUrl.startsWith('http')) {
      Alert.alert('API URL must start with http or https.');
      return;
    }

    let normalizedApiBaseUrl = '';
    try {
      const parsed = new URL(rawApiBaseUrl);
      if (parsed.pathname && parsed.pathname !== '/') {
        Alert.alert('API Base URL should only include host and port, without any path (for example /api or /health).');
        return;
      }
      if (parsed.search || parsed.hash) {
        Alert.alert('API Base URL must not include query params or hash fragments.');
        return;
      }
      normalizedApiBaseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      Alert.alert('API Base URL is invalid. Please enter a valid URL like http://192.168.1.10:8000');
      return;
    }

    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0.5 || parsedThreshold > 1) {
      Alert.alert('Speaker threshold should be between 0.5 and 1.0');
      return;
    }
    if (Number.isNaN(parsedChunk) || parsedChunk < 1 || parsedChunk > 5) {
      Alert.alert('Chunk size should be between 1 and 5 seconds');
      return;
    }

    const settings: AppSettings = {
      apiBaseUrl: normalizedApiBaseUrl,
      speakerMatchThreshold: parsedThreshold,
      chunkSizeSeconds: parsedChunk,
    };
    await AsyncStorage.setItem(storageKeys.appSettings, JSON.stringify(settings));
    onSave(settings);
  };

  const fieldStyle = (name: string) => [
    styles.input,
    focusedField === name && styles.inputFocused,
  ];

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Settings</Text>
        <Pressable onPress={save} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Connection section */}
        <Text style={styles.sectionLabel}>Connection</Text>
        <View style={styles.card}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>API Base URL</Text>
            <TextInput
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              autoCapitalize="none"
              style={fieldStyle('apiUrl')}
              placeholder={FIXED_API_BASE_URL}
              placeholderTextColor={theme.textMuted}
              onFocus={() => setFocusedField('apiUrl')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.fieldHint}>Default: {FIXED_API_BASE_URL}</Text>
          </View>
        </View>

        {/* Analysis section */}
        <Text style={styles.sectionLabel}>Analysis</Text>
        <View style={styles.card}>
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Speaker Match Threshold</Text>
              <Text style={styles.fieldRange}>0.5 – 1.0</Text>
            </View>
            <TextInput
              value={speakerThreshold}
              onChangeText={setSpeakerThreshold}
              keyboardType="decimal-pad"
              style={fieldStyle('threshold')}
              onFocus={() => setFocusedField('threshold')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.fieldHint}>Higher = stricter speaker matching (M3)</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Live Chunk Size</Text>
              <Text style={styles.fieldRange}>1 – 5s</Text>
            </View>
            <TextInput
              value={chunkSize}
              onChangeText={setChunkSize}
              keyboardType="number-pad"
              style={fieldStyle('chunk')}
              onFocus={() => setFocusedField('chunk')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.fieldHint}>Audio chunk size for live mode (M8)</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backBtnText: { color: theme.textMuted, fontSize: 14, fontWeight: '500' },
  screenTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.accent,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  content: { padding: 20 },

  sectionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },

  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    marginBottom: 20,
  },

  fieldGroup: { marginBottom: 2 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fieldLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  fieldRange: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  input: {
    color: theme.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    fontSize: 14,
    fontWeight: '400',
  },
  inputFocused: {
    borderColor: theme.accent,
  },
  fieldHint: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 16,
    marginHorizontal: -2,
  },
});
