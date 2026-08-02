import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassPanel } from '../components/GlassPanel';
import { TopAppBar } from '../components/TopAppBar';
import { WaveformPlaceholder } from '../components/WaveformPlaceholder';
import { colors, gradients, radius, spacing, typography } from '../constants/theme';
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
  const spinAnim = useRef(new Animated.Value(0)).current;
  const {
    status: separationStatus,
    progress: separationProgress,
    stage: separationStage,
    result: separationResult,
    runSeparation,
    reset: resetSeparation,
  } = useSeparationStore();

  // Spinner rotation
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
    ).start();
  }, [spinAnim]);

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

        if (!isMounted) return;

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
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const statusText = useMemo(() => {
    if (activeIndex === 0) return separationStage || 'Separating background sounds...';
    if (activeIndex === 1) return 'Counting speakers...';
    return 'Generating transcript...';
  }, [activeIndex, separationStage]);

  const speechEnergy = separationResult
    ? Math.round((separationResult.processing.speech_energy_ratio ?? 0.82) * 100)
    : 82;
  const bgEnergy = separationResult
    ? Math.round((separationResult.processing.background_energy_ratio ?? 0.18) * 100)
    : 18;

  return (
    <View style={styles.container}>
      {/* Header */}
      <TopAppBar variant="back" title="Processing" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero: Waveform + Status ─────────────────────── */}
        <View style={styles.heroSection}>
          <View style={styles.breathingWaveform}>
            <WaveformPlaceholder
              bars={[30, 50, 20, 60, 40, 70, 50, 30]}
              color={colors.primary}
            />
          </View>
          <Text style={styles.heroTitle}>Analyzing Audio</Text>
          <Text style={styles.heroSub}>{statusText}</Text>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: animatedWidth }]} />
            </View>
            <View style={styles.progressMeta}>
              <Text style={[styles.progressLabel, { color: colors.primary }]}>{progress}% Complete</Text>
              <Text style={styles.progressLabel}>{isRunning ? `${Math.max(0, Math.round((100 - progress) * 0.6))}s remaining` : 'Failed'}</Text>
            </View>
          </View>
        </View>

        {/* ── Pipeline Steps ──────────────────────────────── */}
        <View style={styles.pipelineSection}>
          <Text style={styles.sectionLabel}>Pipeline Status</Text>
          {milestones.map((m, i) => {
            const isDone = i < activeIndex;
            const isActive = i === activeIndex && isRunning;
            const isPending = i > activeIndex;

            return (
              <GlassPanel
                key={m.key}
                style={[
                  styles.pipelineStep,
                  isPending ? { opacity: 0.5 } : {},
                  isActive ? { borderColor: 'rgba(192, 193, 255, 0.4)' } : {},
                ]}
              >
                <View style={styles.pipelineRow}>
                  {isDone ? (
                    <View style={styles.stepDone}>
                      <Text style={styles.stepDoneText}>✓</Text>
                    </View>
                  ) : isActive ? (
                    <Animated.View style={[styles.stepSpinner, { transform: [{ rotate: spin }] }]} />
                  ) : (
                    <View style={styles.stepPending}>
                      <Text style={styles.stepPendingText}>⋯</Text>
                    </View>
                  )}
                  <Text style={[
                    styles.stepLabel,
                    isDone && { color: colors.onSurface },
                    isActive && { color: colors.primary, fontWeight: '600' },
                    isPending && { color: colors.onSurfaceVariant },
                  ]}>
                    {m.label}
                  </Text>
                </View>
                <Text style={[
                  styles.stepStatus,
                  isDone && { color: colors.tertiary },
                  isActive && { color: colors.primary },
                  isPending && { color: colors.onSurfaceVariant },
                ]}>
                  {isDone ? 'DONE' : isActive ? 'RUNNING...' : 'PENDING'}
                </Text>
              </GlassPanel>
            );
          })}
        </View>

        {/* ── Source Separation Card ──────────────────────── */}
        <GlassPanel style={styles.separationCard}>
          <View style={styles.separationHeader}>
            <Text style={styles.cardTitle}>Source Separation</Text>
            <Text style={{ fontSize: 20 }}>📊</Text>
          </View>
          <View style={styles.separationBars}>
            <View style={styles.barSection}>
              <View style={styles.barLabelRow}>
                <Text style={[styles.barLabel, { color: colors.primary }]}>SPEECH ENERGY</Text>
                <Text style={styles.barValue}>{speechEnergy}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${speechEnergy}%`, backgroundColor: colors.primary }]} />
              </View>
            </View>
            <View style={styles.barSection}>
              <View style={styles.barLabelRow}>
                <Text style={[styles.barLabel, { color: colors.secondary }]}>BACKGROUND NOISE</Text>
                <Text style={styles.barValue}>{bgEnergy}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${bgEnergy}%`, backgroundColor: colors.secondary }]} />
              </View>
            </View>
          </View>
        </GlassPanel>
      </ScrollView>

      {/* ── Cancel Button ─────────────────────────────────── */}
      <View style={styles.bottomAction}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
        >
          <Text style={{ fontSize: 16 }}>❌</Text>
          <Text style={styles.cancelText}>Cancel Processing</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: 120, gap: spacing.md },

  // Hero
  heroSection: { alignItems: 'center', paddingVertical: spacing.xl },
  breathingWaveform: { width: '60%', height: 64, marginBottom: 16 },
  heroTitle: { ...typography.headlineLg, color: colors.onSurface, marginBottom: 4 },
  heroSub: { ...typography.bodySm, color: colors.onSurfaceVariant },

  // Progress
  progressContainer: { width: '100%', marginTop: 16 },
  progressTrack: {
    height: 8,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },

  // Pipeline
  pipelineSection: { gap: 8 },
  sectionLabel: {
    ...typography.labelMd,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(78, 222, 163, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(78, 222, 163, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDoneText: { color: colors.tertiary, fontSize: 14, fontWeight: '600' },
  stepSpinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(192, 193, 255, 0.3)',
    borderTopColor: colors.primary,
  },
  stepPending: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPendingText: { color: colors.onSurfaceVariant, fontSize: 14 },
  stepLabel: { ...typography.bodyMd, color: colors.onSurface },
  stepStatus: { ...typography.labelMd, textTransform: 'uppercase' },

  // Separation Card
  separationCard: { padding: spacing.lg },
  separationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { ...typography.headlineMd, color: colors.onSurface },
  separationBars: { gap: spacing.md },
  barSection: { gap: 4 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { ...typography.labelMd, textTransform: 'uppercase' },
  barValue: { ...typography.labelMd, color: colors.onSurface },
  barTrack: {
    height: 16,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  barFill: { height: '100%', borderRadius: radius.lg },

  // Cancel
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: 'rgba(19, 19, 21, 0.8)',
  },
  cancelBtn: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    backgroundColor: 'rgba(147, 0, 10, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelText: { ...typography.headlineMd, color: colors.error, fontSize: 16 },
});
