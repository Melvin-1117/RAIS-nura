import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomNavBar } from '../components/BottomNavBar';
import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { storageKeys } from '../constants/storage';
import { colors, gradients, radius, spacing, typography } from '../constants/theme';
import { AppSettings } from '../types/app';
import { getDefaultApiBaseUrl } from '../utils/network';

const FIXED_API_BASE_URL = getDefaultApiBaseUrl();

type SettingsScreenProps = {
  initialSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
};

const updateIntervals = [1.5, 2, 3];

export const SettingsScreen = ({ initialSettings, onSave, onBack }: SettingsScreenProps) => {
  const [apiBaseUrl, setApiBaseUrl] = useState(initialSettings.apiBaseUrl);
  const [speakerThreshold, setSpeakerThreshold] = useState(initialSettings.speakerMatchThreshold);
  const [chunkSize, setChunkSize] = useState(initialSettings.chunkSizeSeconds);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const load = async () => {
      const raw = await AsyncStorage.getItem(storageKeys.appSettings);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AppSettings;
      const migratedApiBaseUrl =
        parsed.apiBaseUrl === 'http://localhost:8000' ||
        parsed.apiBaseUrl === 'http://localhost:8001' ||
        parsed.apiBaseUrl === 'http://localhost:8002'
          ? FIXED_API_BASE_URL
          : parsed.apiBaseUrl;
      setApiBaseUrl(migratedApiBaseUrl);
      setSpeakerThreshold(parsed.speakerMatchThreshold ?? 0.85);
      setChunkSize(parsed.chunkSizeSeconds ?? 2);
    };
    load();
  }, []);

  const save = async () => {
    const rawApiBaseUrl = apiBaseUrl.trim();

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

    if (speakerThreshold < 0.5 || speakerThreshold > 1) {
      Alert.alert('Speaker threshold should be between 0.5 and 1.0');
      return;
    }

    const settings: AppSettings = {
      apiBaseUrl: normalizedApiBaseUrl,
      speakerMatchThreshold: speakerThreshold,
      chunkSizeSeconds: chunkSize,
    };

    await AsyncStorage.setItem(storageKeys.appSettings, JSON.stringify(settings));
    onSave(settings);
    Alert.alert('Settings saved', 'Your preferences have been updated.');
  };

  const handleNavigation = (tab: 'home' | 'live' | 'profiles' | 'settings') => {
    if (tab !== 'settings') onBack();
  };

  return (
    <View style={styles.container}>
      {/* ── Header ────────────────────────────────────────── */}
      <TopAppBar variant="back" title="Settings" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Connection Section ───────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <GlassPanel style={styles.card}>
            <Text style={styles.label}>Backend API URL</Text>
            <View style={[styles.inputRow, inputFocused && styles.inputFocused]}>
              <TextInput
                value={apiBaseUrl}
                onChangeText={setApiBaseUrl}
                style={styles.input}
                placeholder="http://192.168.1.10:8000"
                placeholderTextColor={colors.outline}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={{ fontSize: 16, color: colors.onSurfaceVariant }}>🔗</Text>
            </View>
          </GlassPanel>
        </View>

        {/* ── Speaker Recognition Section ──────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Speaker Recognition</Text>
          <GlassPanel style={styles.card}>
            <View style={styles.thresholdHeader}>
              <Text style={styles.cardLabel}>Confidence Threshold</Text>
              <Text style={styles.thresholdValue}>{speakerThreshold.toFixed(2)}</Text>
            </View>
            <View style={styles.stepButtonsRow}>
              {[0.5, 0.65, 0.75, 0.85, 0.95].map((val) => {
                const isSelected = Math.abs(speakerThreshold - val) < 0.04;
                return (
                  <Pressable
                    key={val}
                    onPress={() => setSpeakerThreshold(val)}
                    style={[styles.stepBtn, isSelected && styles.stepBtnSelected]}
                  >
                    <Text style={[styles.stepBtnText, isSelected && styles.stepBtnTextSelected]}>
                      {val.toFixed(2)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sliderMinMax}>
              <Text style={styles.sliderMinMaxText}>0.50 (Strict)</Text>
              <Text style={styles.sliderMinMaxText}>1.00 (Exact)</Text>
            </View>
          </GlassPanel>
        </View>

        {/* ── Live Mode Section ────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Mode</Text>
          <GlassPanel style={styles.card}>
            <Text style={[styles.cardLabel, { marginBottom: 12 }]}>Update Interval</Text>
            <View style={styles.segmentedControl}>
              {updateIntervals.map((interval) => {
                const isSelected = chunkSize === interval;
                return (
                  <Pressable
                    key={interval}
                    onPress={() => setChunkSize(interval)}
                    style={[styles.segment, isSelected && styles.segmentSelected]}
                  >
                    {isSelected ? (
                      <LinearGradient
                        colors={gradients.button}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.segmentGradient}
                      >
                        <Text style={styles.segmentTextSelected}>{interval}s</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={styles.segmentText}>{interval}s</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hintText}>Latency balanced for real-time transcription.</Text>
          </GlassPanel>
        </View>

        {/* ── About Section ────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <GlassPanel style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <View style={[styles.aboutRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.aboutLabel}>Model</Text>
              <View style={styles.modelBadge}>
                <Text style={styles.modelText}>distil-whisper</Text>
                <Text style={{ fontSize: 12, color: colors.primary }}>✓</Text>
              </View>
            </View>
          </GlassPanel>
        </View>

        {/* ── Save Action ──────────────────────────────────── */}
        <Pressable
          onPress={save}
          style={({ pressed }) => [styles.saveBtn, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <LinearGradient
            colors={gradients.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtnInner}
          >
            <Text style={styles.saveBtnText}>Save Settings</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {/* ── Bottom Nav ─────────────────────────────────────── */}
      <BottomNavBar activeTab="settings" onNavigate={handleNavigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 110, gap: spacing.lg },

  // Sections
  section: { gap: spacing.xs },
  sectionTitle: {
    ...typography.labelMd,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingLeft: 4,
  },
  card: { padding: spacing.md },

  // Input
  label: { ...typography.bodySm, color: colors.onSurfaceVariant, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  inputFocused: { borderColor: 'rgba(192, 193, 255, 0.5)' },
  input: {
    flex: 1,
    height: 48,
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 14,
  },

  // Threshold
  thresholdHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel: { ...typography.bodyMd, color: colors.onSurface },
  thresholdValue: { ...typography.headlineMd, color: colors.primary, fontFamily: 'monospace' },
  stepButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 8 },
  stepBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtnSelected: { backgroundColor: 'rgba(192, 193, 255, 0.2)', borderColor: colors.primary },
  stepBtnText: { ...typography.labelMd, color: colors.onSurfaceVariant, fontSize: 11 },
  stepBtnTextSelected: { color: colors.primary, fontWeight: '700' },
  sliderMinMax: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderMinMaxText: { fontSize: 10, color: colors.outline, fontFamily: 'monospace' },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLowest,
    padding: 4,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
  },
  segment: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  segmentSelected: { overflow: 'hidden' },
  segmentGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  segmentText: { ...typography.labelMd, color: colors.onSurfaceVariant },
  segmentTextSelected: { ...typography.labelMd, color: colors.white, fontWeight: '700' },
  hintText: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 12, fontStyle: 'italic' },

  // About
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  aboutLabel: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  aboutValue: { ...typography.bodyMd, color: colors.onSurface, fontFamily: 'monospace' },
  modelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelText: { ...typography.bodyMd, color: colors.primary, fontFamily: 'monospace' },

  // Save button
  saveBtn: { borderRadius: radius.pill, overflow: 'hidden', height: 56, marginTop: 8 },
  saveBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: colors.white, ...typography.headlineMd, fontSize: 16 },
});
