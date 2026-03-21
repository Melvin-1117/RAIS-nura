import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import { HomeScreen } from './src/screens/HomeScreen';
import { LiveDashboardScreen } from './src/screens/LiveDashboardScreen';
import { ProcessingScreen } from './src/screens/ProcessingScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpeakerProfilesScreen } from './src/screens/SpeakerProfilesScreen';
import { defaultSettings, type AppScreen, type PickedAudio } from './src/types/app';
import { type DiarizationResponse } from './src/types/diarization';

export default function App() {
  const [screen, setScreen] = React.useState<AppScreen>('home');
  const [selectedAudio, setSelectedAudio] = React.useState<PickedAudio | null>(null);
  const [result, setResult] = React.useState<DiarizationResponse | null>(null);
  const [settings, setSettings] = React.useState(defaultSettings);

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
      <StatusBar barStyle="light-content" />
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
      {screen === 'profiles' && <SpeakerProfilesScreen onBack={() => setScreen('home')} />}
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
