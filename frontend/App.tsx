import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HomeScreen } from './src/screens/HomeScreen';
import { LiveDashboardScreen } from './src/screens/LiveDashboardScreen';
import { ProcessingScreen } from './src/screens/ProcessingScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpeakerProfilesScreen } from './src/screens/SpeakerProfilesScreen';
import { storageKeys } from './src/constants/storage';
import { defaultSettings, type AppScreen, type PickedAudio } from './src/types/app';
import { type DiarizationResponse } from './src/types/diarization';

export default function App() {
  const [screen, setScreen] = React.useState<AppScreen>('home');
  const [selectedAudio, setSelectedAudio] = React.useState<PickedAudio | null>(null);
  const [result, setResult] = React.useState<DiarizationResponse | null>(null);
  const [settings, setSettings] = React.useState(defaultSettings);

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKeys.appSettings);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        if (
          typeof parsed?.apiBaseUrl === 'string' &&
          typeof parsed?.speakerMatchThreshold === 'number' &&
          typeof parsed?.chunkSizeSeconds === 'number'
        ) {
          setSettings(parsed);
        }
      } catch {
        // Ignore malformed settings and continue with defaults.
      }
    };

    loadSettings();
  }, []);

  const startProcessing = (audio: PickedAudio) => {
    setSelectedAudio(audio);
    setResult(null);
    setScreen('processing');
  };

  const completeProcessing = (payload: DiarizationResponse) => {
    setResult(payload);
    setScreen('results');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#09090B" />
      {screen === 'home' && (
        <HomeScreen
          onStartProcess={startProcessing}
          onOpenLive={() => setScreen('live')}
          onOpenProfiles={() => setScreen('profiles')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'live' && <LiveDashboardScreen onBack={() => setScreen('home')} />}
      {screen === 'processing' && selectedAudio && (
        <ProcessingScreen
          audio={selectedAudio}
          settings={settings}
          onBack={() => setScreen('home')}
          onComplete={completeProcessing}
        />
      )}
      {screen === 'results' && result && (
        <ResultsScreen
          result={result}
          onGoHome={() => setScreen('home')}
          onOpenProfiles={() => setScreen('profiles')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'profiles' && (
        <SpeakerProfilesScreen
          apiBaseUrl={settings.apiBaseUrl}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          initialSettings={settings}
          onSave={(updated) => {
            setSettings(updated);
            setScreen('home');
          }}
          onBack={() => setScreen('home')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090B',
  },
});
