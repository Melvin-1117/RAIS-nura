// ── Demo / Sample data for showcasing the app without a backend ─────────

export interface DemoSegment {
  start: number;
  end: number;
  speaker: string;
  speaker_display?: string;
}

export interface DemoUtterance {
  start: number;
  end: number;
  speaker: string;
  speaker_display?: string;
  text: string;
}

export interface DemoSpeakerMatch {
  speaker: string;
  display_name: string;
  confidence: number;
  matched: boolean;
}

export interface DemoSoundEvent {
  start: number;
  end: number;
  label: string;
  category: string;
  distance: "Near" | "Mid" | "Far";
  intensity: "Low" | "Medium" | "High";
  confidence: number;
}

export interface DemoResult {
  total_speakers: number;
  segments: DemoSegment[];
  speaker_labels: string[];
  speaker_matches: DemoSpeakerMatch[];
  utterances: DemoUtterance[];
  sounds: DemoSoundEvent[];
  processing: {
    duration_seconds: number;
    source_sample_rate: number;
    output_sample_rate: number;
    transcript_mode: string;
    separation_confirmed: boolean;
    speech_energy_ratio: number;
    background_energy_ratio: number;
  };
}

export const DEMO_RESULT: DemoResult = {
  total_speakers: 3,
  speaker_labels: ["Speaker A", "Speaker B", "Speaker C"],
  speaker_matches: [
    {
      speaker: "Speaker A",
      display_name: "Alice Chen",
      confidence: 0.94,
      matched: true,
    },
    {
      speaker: "Speaker B",
      display_name: "Bob Martinez",
      confidence: 0.88,
      matched: true,
    },
    {
      speaker: "Speaker C",
      display_name: "Speaker C",
      confidence: 0,
      matched: false,
    },
  ],
  segments: [
    { start: 0.0, end: 8.2, speaker: "Speaker A" },
    { start: 8.5, end: 18.1, speaker: "Speaker B" },
    { start: 18.4, end: 26.7, speaker: "Speaker A" },
    { start: 27.0, end: 42.5, speaker: "Speaker C" },
    { start: 42.8, end: 55.3, speaker: "Speaker B" },
    { start: 55.6, end: 68.0, speaker: "Speaker A" },
    { start: 68.3, end: 82.9, speaker: "Speaker C" },
    { start: 83.2, end: 95.0, speaker: "Speaker B" },
    { start: 95.3, end: 110.6, speaker: "Speaker A" },
    { start: 111.0, end: 125.4, speaker: "Speaker C" },
    { start: 125.8, end: 140.2, speaker: "Speaker B" },
    { start: 140.5, end: 158.0, speaker: "Speaker A" },
  ],
  utterances: [
    {
      start: 0.0,
      end: 8.2,
      speaker: "Speaker A",
      text: "Good morning everyone. Let's get started with our weekly sync. I wanted to cover the progress on the audio intelligence pipeline first.",
    },
    {
      start: 8.5,
      end: 18.1,
      speaker: "Speaker B",
      text: "Sure. I finished integrating the speaker diarization module yesterday. We're now using pyannote 3.1 and the accuracy on our test set improved from 82 to 91 percent.",
    },
    {
      start: 18.4,
      end: 26.7,
      speaker: "Speaker A",
      text: "That's great progress Bob. What about the real-time streaming support? Are we still on track for the Friday demo?",
    },
    {
      start: 27.0,
      end: 42.5,
      speaker: "Speaker C",
      text: "I've been working on the WebSocket layer for live transcription. The chunk processing is running at about 200 milliseconds latency now, which is well under our 3-second target. I still need to handle the reconnection logic though.",
    },
    {
      start: 42.8,
      end: 55.3,
      speaker: "Speaker B",
      text: "One thing I noticed is that the sound classification model sometimes mislabels keyboard typing as rainfall when the confidence threshold is below 0.5. I think we should bump the threshold to 0.6 for the demo.",
    },
    {
      start: 55.6,
      end: 68.0,
      speaker: "Speaker A",
      text: "Good catch. Let's set it at 0.6 for now and we can tune it later. How's the mobile app coming along? Are we still using Expo managed workflow?",
    },
    {
      start: 68.3,
      end: 82.9,
      speaker: "Speaker C",
      text: "Yes, the Expo build is working well on both iOS and Android. I added the file picker component yesterday and it handles MP3, WAV, and M4A formats. The upload to our FastAPI backend takes about 2 seconds for a 5-minute recording.",
    },
    {
      start: 83.2,
      end: 95.0,
      speaker: "Speaker B",
      text: "I also wanted to mention that the speaker recognition matching is working now. We tested it with 5 pre-registered voice profiles and it correctly identified 4 out of 5 with over 85 percent confidence.",
    },
    {
      start: 95.3,
      end: 110.6,
      speaker: "Speaker A",
      text: "Excellent. So for the demo flow we'll show: file upload, speaker count, diarized transcript, sound classification, and then switch to live mode. Does that sound like a good order?",
    },
    {
      start: 111.0,
      end: 125.4,
      speaker: "Speaker C",
      text: "That works. I'll make sure the live dashboard has all five panels ready — transcript, active speakers, background sounds, distance map, and intensity meter. The UI uses the glassmorphism design system we finalized last week.",
    },
    {
      start: 125.8,
      end: 140.2,
      speaker: "Speaker B",
      text: "One last thing — I deployed the backend to our staging server and the health check endpoint is responding. The AssemblyAI integration is using the universal-3-pro model now which gives us better accuracy on multilingual content.",
    },
    {
      start: 140.5,
      end: 158.0,
      speaker: "Speaker A",
      text: "Perfect. Let's aim to have everything merged by Thursday evening so we have Friday morning for end-to-end testing. Great work everyone, this is shaping up really well. Let's reconvene tomorrow at the same time.",
    },
  ],
  sounds: [
    {
      start: 0.0,
      end: 158.0,
      label: "Air conditioning hum",
      category: "Artificial",
      distance: "Mid",
      intensity: "Low",
      confidence: 0.78,
    },
    {
      start: 12.3,
      end: 14.8,
      label: "Keyboard typing",
      category: "Artificial",
      distance: "Near",
      intensity: "Medium",
      confidence: 0.85,
    },
    {
      start: 35.0,
      end: 36.2,
      label: "Paper rustling",
      category: "Human Activity",
      distance: "Near",
      intensity: "Low",
      confidence: 0.62,
    },
    {
      start: 52.4,
      end: 53.1,
      label: "Notification chime",
      category: "Artificial",
      distance: "Near",
      intensity: "Medium",
      confidence: 0.91,
    },
    {
      start: 78.0,
      end: 80.5,
      label: "Chair creaking",
      category: "Human Activity",
      distance: "Near",
      intensity: "Low",
      confidence: 0.58,
    },
    {
      start: 100.0,
      end: 158.0,
      label: "Distant traffic",
      category: "Artificial",
      distance: "Far",
      intensity: "Low",
      confidence: 0.45,
    },
    {
      start: 120.0,
      end: 122.0,
      label: "Door closing",
      category: "Human Activity",
      distance: "Mid",
      intensity: "Medium",
      confidence: 0.72,
    },
  ],
  processing: {
    duration_seconds: 158.0,
    source_sample_rate: 44100,
    output_sample_rate: 16000,
    transcript_mode: "assemblyai_universal_3_pro",
    separation_confirmed: true,
    speech_energy_ratio: 0.82,
    background_energy_ratio: 0.18,
  },
};
