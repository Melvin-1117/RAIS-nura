import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SeparationStatusCard } from '../components/SeparationStatusCard';
import { theme } from '../constants/theme';
import { diarizeAudioFile } from '../services/api';
import { useSeparationStore } from '../store/separationStore';
import { AppSettings, PickedAudio } from '../types/app';
import { DiarizationResponse } from '../types/diarization';
import { SeparationResult } from '../types/separation';

type ProcessingScreenProps = {
  audio: PickedAudio;
  settings: AppSettings;
  onBack: () => void;
  onComplete: (result: DiarizationResponse) => void;
};

const milestones = [
  { key: 'M4', label: 'Background Segregation' },
  { key: 'M1', label: 'Speaker Count' },
  { key: 'M2', label: 'Transcript' },
];

export const ProcessingScreen = ({ audio, settings, onBack, onComplete }: ProcessingScreenProps) => {
  const [progress, setProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const {
    status: separationStatus,
    progress: separationProgress,
    stage: separationStage,
    result: separationResult,
    runSeparation,
    reset: resetSeparation,
  } = useSeparationStore();

  useEffect(() => {
    if (separationStatus === 'queued' || separationStatus === 'running') {
      const m4Progress = Math.max(4, Math.min(60, Math.round(separationProgress * 0.6)));
      setActiveIndex(0);
      setProgress((prev) => Math.max(prev, m4Progress));
      Animated.timing(progressAnim, { toValue: m4Progress, duration: 250, useNativeDriver: false }).start();
      return;
    }

    if (separationStatus === 'completed') {
      setActiveIndex(1);
      setProgress((prev) => Math.max(prev, 60));
      Animated.timing(progressAnim, { toValue: 60, duration: 250, useNativeDriver: false }).start();
    }
  }, [progressAnim, separationProgress, separationStatus]);

  useEffect(() => {
    let isMounted = true;
    let diarizationTimer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      resetSeparation();

      try {
        let m4Result: SeparationResult | null = null;
        try {
          m4Result = await runSeparation(audio.uri, audio.name, audio.mimeType, settings.apiBaseUrl);
        } catch {
          m4Result = null;
        }

        if (!isMounted) {
          return;
        }

        setActiveIndex(1);
        diarizationTimer = setInterval(() => {
          setProgress((prev) => {
            const next = prev < 95 ? prev + 4 : prev;
            Animated.timing(progressAnim, { toValue: next, duration: 300, useNativeDriver: false }).start();
            return next;
          });
          setActiveIndex((prev) => (prev < milestones.length - 1 ? prev + 1 : prev));
        }, 500);

        const diarizationInputUri =
          Platform.OS === 'web' && m4Result?.vocals_url
            ? m4Result.vocals_url
            : audio.uri;

        const diarizationMimeType =
          Platform.OS === 'web' && m4Result?.vocals_url
            ? 'audio/wav'
            : audio.mimeType;

        const result = await diarizeAudioFile(
          diarizationInputUri,
          audio.name,
          diarizationMimeType,
          settings.apiBaseUrl
        );

        if (diarizationTimer) clearInterval(diarizationTimer);
        if (!isMounted) return;

        const mergedResult: DiarizationResponse = m4Result
          ? {
              ...result,
              sounds: m4Result.sounds?.length ? m4Result.sounds : result.sounds,
              processing: {
                ...result.processing,
                separation_confirmed: true,
                speech_energy_ratio:
                  m4Result.processing.speech_energy_ratio ?? result.processing.speech_energy_ratio ?? 0,
                background_energy_ratio:
                  m4Result.processing.background_energy_ratio ?? result.processing.background_energy_ratio ?? 0,
              },
            }
          : result;

        setProgress(100);
        Animated.timing(progressAnim, { toValue: 100, duration: 300, useNativeDriver: false }).start();
        setTimeout(() => onComplete(mergedResult), 350);
      } catch (error: any) {
        if (diarizationTimer) clearInterval(diarizationTimer);
        if (!isMounted) return;
        setIsRunning(false);
        const rawMessage = error?.response?.data?.detail ?? error?.message ?? 'Request failed';
        const normalizedMessage =
          typeof rawMessage === 'string' && rawMessage.toLowerCase().includes('timeout')
            ? 'Backend processing is taking longer than expected. Please retry with a shorter file or wait and run again.'
            : rawMessage;
        Alert.alert('Processing failed', normalizedMessage);
      }
    };

    run();
    return () => {
      isMounted = false;
      if (diarizationTimer) clearInterval(diarizationTimer);
    };
  }, [
    audio.mimeType,
    audio.name,
    audio.uri,
    onComplete,
    progressAnim,
    resetSeparation,
    runSeparation,
    settings.apiBaseUrl,
  ]);

  const animatedWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const activeMilestone = useMemo(() => milestones[activeIndex], [activeIndex]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Processing</Text>
        {!isRunning && (
          <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
        {/* File info */}
        <View style={styles.fileCard}>
          <View style={styles.fileIcon} />
          <Text style={styles.fileName} numberOfLines={1}>{audio.name}</Text>
        </View>

        {/* Progress section */}
        <View style={styles.card}>
          <View style={styles.progressHeader}>
            {isRunning ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <View style={styles.errorDot} />
            )}
            <Text style={styles.progressLabel}>
              {isRunning ? `${milestones[activeIndex]?.key} · ${milestones[activeIndex]?.label}` : 'Processing stopped'}
            </Text>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>

          {/* Track */}
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: animatedWidth }]} />
          </View>

          {/* Milestones */}
          <View style={styles.milestones}>
            {milestones.map((m, idx) => {
              const done = idx < activeIndex;
              const active = idx === activeIndex;
              return (
                <View key={m.key} style={styles.mRow}>
                  <View style={[styles.mDot, done && styles.mDotDone, active && styles.mDotActive, !done && !active && styles.mDotIdle]}>
                    {done && <Text style={styles.mCheck}>✓</Text>}
                  </View>
                  <Text style={[styles.mKey, (done || active) ? styles.mKeyActive : styles.mKeyIdle]}>{m.key}</Text>
                  <Text style={[styles.mLabel, active ? styles.mLabelActive : done ? styles.mLabelDone : styles.mLabelIdle]}>{m.label}</Text>
                </View>
              );
            })}
          </View>

          <SeparationStatusCard
            status={separationStatus}
            progress={separationProgress}
            stage={separationStage}
            vocalsReady={Boolean(separationResult?.vocals_url)}
            backgroundReady={Boolean(separationResult?.background_url)}
          />
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
  screenTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '700' },
  backBtn: { paddingVertical: 6, paddingLeft: 12 },
  backBtnText: { color: theme.accent, fontSize: 14, fontWeight: '500' },

  content: { padding: 20 },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  fileIcon: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent,
  },
  fileName: { color: theme.textSecondary, fontSize: 13, fontWeight: '500', flex: 1 },

  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  errorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },
  progressLabel: { color: theme.textPrimary, fontWeight: '600', fontSize: 14, flex: 1 },
  progressPct: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    marginBottom: 20,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: theme.accent,
  },

  milestones: { gap: 10 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  mDotDone: { backgroundColor: theme.accentGreen },
  mDotActive: { backgroundColor: theme.accent },
  mDotIdle: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: theme.border },
  mCheck: { color: '#fff', fontSize: 10, fontWeight: '800' },
  mKey: { fontSize: 12, fontWeight: '700', width: 26 },
  mKeyActive: { color: theme.textPrimary },
  mKeyIdle: { color: theme.textMuted },
  mLabel: { fontSize: 13, flex: 1 },
  mLabelActive: { color: theme.textPrimary, fontWeight: '600' },
  mLabelDone: { color: theme.textSecondary },
  mLabelIdle: { color: theme.textMuted },
});
