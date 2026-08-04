import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

// ── 5-stage pipeline (matches real backend processing order) ────────────────
const milestones = [
  { key: 'M4', label: 'Sound Separation', icon: '🔊', status: 'Isolating speech from background…' },
  { key: 'M1', label: 'Speaker Diarization', icon: '🎙️', status: 'Identifying speaker segments…' },
  { key: 'M2', label: 'Transcription', icon: '📝', status: 'Converting speech to text…' },
  { key: 'M3', label: 'Speaker Recognition', icon: '👤', status: 'Matching against enrolled profiles…' },
  { key: 'M5', label: 'Sound Analysis', icon: '🔉', status: 'Classifying background sounds…' },
];

export const ProcessingScreen = ({ audio, settings, onBack, onComplete }: ProcessingScreenProps) => {
  const [progress, setProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const fadeError = useRef(new Animated.Value(0)).current;
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
      const m4Progress = Math.max(4, Math.min(18, Math.round(separationProgress * 0.18)));
      setActiveIndex(0);
      setProgress((prev) => Math.max(prev, m4Progress));
      Animated.timing(progressAnim, { toValue: m4Progress, duration: 250, useNativeDriver: false }).start();
      return;
    }

    if (separationStatus === 'completed') {
      setActiveIndex(1);
      setProgress((prev) => Math.max(prev, 20));
      Animated.timing(progressAnim, { toValue: 20, duration: 250, useNativeDriver: false }).start();
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

        // Advance through stages 1–4 progressively during diarization
        setActiveIndex(1);
        let stageCounter = 0;
        diarizationTimer = setInterval(() => {
          stageCounter += 1;
          setProgress((prev) => {
            const next = prev < 95 ? prev + 3 : prev;
            Animated.timing(progressAnim, { toValue: next, duration: 300, useNativeDriver: false }).start();
            return next;
          });
          // Advance visible stage every ~3 ticks (1.5s)
          if (stageCounter % 3 === 0) {
            setActiveIndex((prev) => (prev < milestones.length - 1 ? prev + 1 : prev));
          }
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

        // Mark all stages done
        setActiveIndex(milestones.length);
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
        setErrorMessage(normalizedMessage);
        // Fade in the error card
        Animated.timing(fadeError, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
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
    fadeError,
    resetSeparation,
    runSeparation,
    settings.apiBaseUrl,
  ]);

  const animatedWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const statusText = useMemo(() => {
    if (errorMessage) return 'Processing failed';
    if (activeIndex >= milestones.length) return 'Analysis complete!';
    if (activeIndex === 0) return separationStage || milestones[0].status;
    return milestones[activeIndex]?.status || 'Processing…';
  }, [activeIndex, separationStage, errorMessage]);

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
              color={errorMessage ? colors.error : colors.primary}
            />
          </View>
          <Text style={styles.heroTitle}>
            {errorMessage ? 'Processing Failed' : 'Analyzing Audio'}
          </Text>
          <Text style={[styles.heroSub, errorMessage && { color: colors.error }]}>{statusText}</Text>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: animatedWidth },
                  errorMessage && { backgroundColor: colors.error },
                ]}
              />
            </View>
            <View style={styles.progressMeta}>
              <Text style={[styles.progressLabel, { color: errorMessage ? colors.error : colors.primary }]}>
                {errorMessage ? 'Error' : `${progress}% Complete`}
              </Text>
              <Text style={styles.progressLabel}>
                {errorMessage
                  ? ''
                  : isRunning
                  ? `${Math.max(0, Math.round((100 - progress) * 0.6))}s remaining`
                  : 'Failed'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Inline Error Card (replaces Alert.alert) ──────── */}
        {errorMessage && (
          <Animated.View style={[styles.errorCard, { opacity: fadeError }]}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
            >
              <Text style={styles.retryBtnText}>← Back to Home</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Pipeline Steps ──────────────────────────────── */}
        <View style={styles.pipelineSection}>
          <Text style={styles.sectionLabel}>Pipeline Status</Text>
          {milestones.map((m, i) => {
            const isDone = i < activeIndex;
            const isActive = i === activeIndex && isRunning && !errorMessage;
            const isFailed = i === activeIndex && !isRunning && !!errorMessage;
            const isPending = i > activeIndex;

            return (
              <GlassPanel
                key={m.key}
                style={[
                  styles.pipelineStep,
                  isPending ? { opacity: 0.4 } : {},
                  isActive ? { borderColor: 'rgba(192, 193, 255, 0.4)' } : {},
                  isFailed ? { borderColor: 'rgba(255, 180, 171, 0.4)' } : {},
                ]}
              >
                <View style={styles.pipelineRow}>
                  {isDone ? (
                    <View style={styles.stepDone}>
                      <Text style={styles.stepDoneText}>✓</Text>
                    </View>
                  ) : isFailed ? (
                    <View style={styles.stepFailed}>
                      <Text style={styles.stepFailedText}>✕</Text>
                    </View>
                  ) : isActive ? (
                    <Animated.View style={[styles.stepSpinner, { transform: [{ rotate: spin }] }]} />
                  ) : (
                    <View style={styles.stepPending}>
                      <Text style={styles.stepPendingText}>⋯</Text>
                    </View>
                  )}
                  <View style={{ gap: 2 }}>
                    <Text style={[
                      styles.stepLabel,
                      isDone && { color: colors.onSurface },
                      isActive && { color: colors.primary, fontWeight: '600' },
                      isFailed && { color: colors.error, fontWeight: '600' },
                      isPending && { color: colors.onSurfaceVariant },
                    ]}>
                      {m.icon} {m.label}
                    </Text>
                    {isActive && (
                      <Text style={styles.stepSubtext}>{m.status}</Text>
                    )}
                  </View>
                </View>
                <Text style={[
                  styles.stepStatus,
                  isDone && { color: colors.tertiary },
                  isActive && { color: colors.primary },
                  isFailed && { color: colors.error },
                  isPending && { color: colors.onSurfaceVariant },
                ]}>
                  {isDone ? 'DONE' : isFailed ? 'FAILED' : isActive ? 'RUNNING' : 'PENDING'}
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
      {!errorMessage && (
        <View style={styles.bottomAction}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
          >
            <Text style={{ fontSize: 16 }}>❌</Text>
            <Text style={styles.cancelText}>Cancel Processing</Text>
          </Pressable>
        </View>
      )}
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

  // Inline Error Card
  errorCard: {
    backgroundColor: 'rgba(147, 0, 10, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.25)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorIcon: { fontSize: 32 },
  errorTitle: { ...typography.headlineMd, color: colors.error },
  errorBody: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    backgroundColor: 'rgba(147, 0, 10, 0.15)',
  },
  retryBtnText: { ...typography.labelMd, color: colors.error, fontSize: 14 },

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
  stepFailed: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepFailedText: { color: colors.error, fontSize: 14, fontWeight: '700' },
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
  stepSubtext: { ...typography.labelMd, color: colors.onSurfaceVariant, fontSize: 10, fontWeight: '400' },
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
