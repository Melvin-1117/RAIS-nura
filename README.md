# Real-Time Audio Intelligence System
### Product Requirements Document
**Nura AI Labs Hackathon · React Native Mobile App · 24-Hour Sprint · 8 Milestones · 2 Phases**

---

## 1. Product Overview

This PRD defines the scope, architecture, milestones, and implementation plan for building a Real-Time Audio Intelligence System in React Native within a 24-hour hackathon. The system moves beyond simple transcription — it understands who is speaking, what is being said, and what environmental sounds are present.

| Duration | Platform | Phase 1 | Phase 2 |
|---|---|---|---|
| 24 Hours | React Native | Offline (M1–M7) | Live Stream (M8) |

### 1.1 Goal

Build a React Native mobile app that processes both recorded and live audio to produce structured, speaker-aware, and context-aware intelligence including speech transcription, speaker diarization, background sound classification, distance estimation, and intensity analysis.

### 1.2 Two-Phase Approach

| Phase | Description |
|---|---|
| Phase 1 — Offline | Process pre-recorded audio files. Focus on accuracy and pipeline correctness across 7 milestones (M1–M7). |
| Phase 2 — Live | Extend the pipeline to continuous microphone input in real time (M8). Low latency, continuous display. |

---

## 2. Technology Stack

| Layer | Tool / Library / Service |
|---|---|
| Mobile Framework | React Native (Expo managed workflow for speed) |
| Audio Capture (Live) | expo-av or react-native-audio-recorder-player |
| Audio File Picker | expo-document-picker |
| Speech-to-Text (STT) | Whisper API (OpenAI) or AssemblyAI streaming API |
| Speaker Diarization | AssemblyAI (diarization: true) or pyannote.audio via backend |
| Speaker Recognition | AssemblyAI speaker profiles or custom embedding server |
| Sound Classification | YAMNet via TensorFlow.js or Google Cloud Audio Intelligence |
| Background Separation | Demucs (server-side) or Web Audio API spectral gating |
| Distance Estimation | Energy/reverb heuristics — custom logic on audio features |
| Intensity Analysis | RMS/loudness calculation — Web Audio API or custom FFT |
| Backend (optional) | FastAPI or Node.js (for heavy models: Whisper, pyannote, Demucs) |
| State Management | Zustand or React Context |
| UI Components | React Native Paper or custom components |
| Visualization | react-native-chart-kit or Victory Native |
| Networking | Axios + WebSocket (for live streaming phase) |

> **⚡ Hackathon Strategy**
> - Use fully-managed cloud APIs (AssemblyAI, OpenAI Whisper) for M1–M3 to save time.
> - Use TensorFlow.js in-app for M4–M7 sound classification to avoid extra backend complexity.
> - Keep the backend minimal — only spin one up if on-device processing is too slow.
> - Focus Phase 1 on correctness. Then adapt the same pipeline for Phase 2 real-time.

---

## 3. Milestones & Detailed Requirements

---

## PHASE 1 — RECORDED AUDIO PROCESSING (Milestones 1–7)

---

### Milestone 1 — Speaker Count Extraction

Process a recorded audio file and accurately count distinct speakers.

**User Story**
As a user, I upload an audio file and the app tells me how many unique speakers are in the conversation.

**Functional Requirements**
- Accept audio input: `.mp3`, `.wav`, `.m4a` via file picker
- Convert audio to 16kHz mono WAV before analysis
- Submit audio to AssemblyAI with `speaker_labels: true`
- Parse API response to extract unique speaker IDs
- Display speaker count prominently on the results screen
- Handle edge cases: silence-only files, single speaker, ambiguous segments

**Implementation Approach**
- Use `expo-document-picker` to let the user pick a file
- Upload file to AssemblyAI `/v2/upload` endpoint, then POST to `/v2/transcript` with `speaker_labels: true`
- Poll `/v2/transcript/{id}` until `status === 'completed'`
- Count unique values in `utterances[].speaker`

**Expected Output**
```
Speakers detected: 3
Speaker IDs: [A, B, C]
Duration: 4:32
```

---

### Milestone 2 — Speaker-wise Speech Extraction

Produce a full diarized transcript with each segment attributed to the correct speaker.

**User Story**
As a user, I see a timestamped, color-coded transcript showing exactly who said what and when.

**Functional Requirements**
- Build on M1 pipeline — use the same AssemblyAI response
- Extract `utterances` array: `{ speaker, text, start, end }`
- Display each utterance as a chat-bubble UI element with speaker label and timestamp
- Assign consistent colors to each speaker across the transcript
- Preserve conversational flow — utterances sorted by `start` time
- Show a continuous scrollable transcript view

**UI Specification**

| Element | Detail |
|---|---|
| Speaker bubble | Rounded card, left/right aligned alternating by speaker |
| Speaker label | Bold, colored badge (e.g., Speaker A in blue, B in orange) |
| Timestamp | `HH:MM:SS` displayed below each bubble |
| Scroll behavior | FlatList with auto-scroll to latest |

---

### Milestone 3 — Speaker Recognition

Match detected speakers against a library of known voice profiles and assign real names.

**User Story**
As a user, I can pre-register known speakers (e.g., "Alice", "Bob"). The app identifies them in uploaded audio and labels their transcript segments with their real names.

**Functional Requirements**
- Speaker profile management screen: add/remove known speakers with voice samples
- Store speaker profiles locally (AsyncStorage or SQLite) as embedding vectors
- On processing, extract embeddings from each detected speaker segment
- Cosine similarity match against stored profiles — threshold ≥ 0.85 for positive ID
- If no match exceeds threshold, label as "Unknown Speaker"
- Display confidence score alongside each speaker label

**Implementation Options**
- **Option A (recommended):** AssemblyAI speaker profiles API (if available in tier)
- **Option B:** Run `resemblyzer` or `speechbrain` on a small FastAPI backend, call from app
- **Option C:** Use OpenAI embeddings on transcribed segments as a fallback proxy

---

### Milestone 4 — Background Sound Segregation

Separate speech from non-speech audio components for independent analysis.

**User Story**
As a user, after uploading audio, I can see the system has cleanly separated voice content from background noise and environmental sounds.

**Functional Requirements**
- Run a source separation model on the uploaded audio file
- Produce two streams: (1) speech-only, (2) background-only
- Both streams must cover the full duration without gaps
- Display a visual indicator showing the separation was successful

**Implementation Approach**
- Use Demucs (`htdemucs` model) on a lightweight backend (FastAPI) to separate vocals/background
- Alternatively, use spectral subtraction with Web Audio API for an in-app approach
- Return two audio segments; use the background stream as input for M5–M7

---

### Milestone 5 — Sound Categorization

Label and categorize every detected non-speech sound in the audio.

**User Story**
As a user, I see a structured breakdown of all background sounds identified, grouped into categories like "Natural", "Artificial", "Human Activity", etc.

**Functional Requirements**
- Run YAMNet or PANNs audio classification on the background stream
- Detect individual sound events with timestamps
- Label each sound with a specific tag (fan, rain, engine, cough, music, etc.)
- Group tags into 5 categories: Natural, Artificial, Human Activity, Music, Animal
- Display a category card UI with icons and sound event list

**Sound Category Mapping**

| Category | Examples |
|---|---|
| 🌿 Natural | Rain, Wind / Breeze, Thunder, Water stream |
| ⚙️ Artificial | Fan, AC hum, Engine, Traffic, Keyboard |
| 🤧 Human Activity | Cough, Sneeze, Clapping, Footsteps |
| 🎵 Music | Songs playing in background, Instruments |
| 🐾 Animal | Dog barking, Birds singing, Cat meow |

---

### Milestone 6 — Sound Distance Estimation

Estimate the relative spatial distance of each sound source from the microphone.

**User Story**
As a user, I see each detected sound tagged with a distance label (Near / Mid / Far) so I can understand the spatial context of the recording.

**Functional Requirements**
- For each classified sound event, estimate distance using acoustic features
- Distance classes: Near (< 1m), Mid (1–5m), Far (> 5m)
- Handle multiple simultaneous sounds independently
- Display distance badge alongside each sound label

**Distance Estimation Heuristics**
- RMS energy level: higher energy → Near, lower → Far
- Reverb tail analysis: longer reverb → Far (use RT60 approximation)
- High-frequency roll-off: significant roll-off above 4kHz → Far
- Combine all 3 features with a simple weighted scoring function

---

### Milestone 7 — Sound Intensity Analysis

Measure and label the relative loudness of each sound source.

**User Story**
As a user, I see each sound labeled with its intensity level (Low / Medium / High) so I know which sounds are dominant vs. subtle.

**Functional Requirements**
- Compute RMS amplitude for each sound event window
- Normalize relative to overall audio level
- Label intensity: Low (< 30% max), Medium (30–70%), High (> 70%)
- Display intensity with a visual bar or badge
- Distinguish prominent sounds (high intensity) from background noise (low intensity)

---

## PHASE 2 — LIVE AUDIO PROCESSING (Milestone 8)

---

### Milestone 8 — Real-Time Audio Intelligence System

Extend the full pipeline to continuous live microphone input and display all insights in real-time on screen.

**User Story**
As a user, I press "Start Listening" and see a live dashboard updating in real time — showing who is speaking, what they are saying, what background sounds are present, and their distance and loudness.

**Functional Requirements**
- Request microphone permission and begin recording in chunked audio segments
- Process each 2–3 second audio chunk through the full pipeline
- Stream transcription using AssemblyAI real-time WebSocket API
- Run sound classification on each chunk via in-app TensorFlow.js model
- Update all UI panels continuously with < 3 second latency
- Allow user to start and stop the live session
- Session can be saved as a recording for replay

**Live Dashboard UI Panels**

| Panel | Content |
|---|---|
| 🎤 Live Transcript | Scrolling text with speaker labels and real-time word updates |
| 👥 Active Speakers | Speaker count + per-speaker activity indicator |
| 🔊 Background Sounds | Categorized sound list, updating in real time |
| 📍 Distance Map | Near / Mid / Far labels per sound source |
| 📊 Intensity Meter | Live VU-meter style bars per source |

---

## 4. App Screen Flow

| Screen | Purpose & Key Elements |
|---|---|
| Home Screen | Two CTAs: "Upload Audio File" (Phase 1) and "Start Live Listening" (Phase 2) |
| File Picker | System file picker via expo-document-picker; shows selected file name and duration |
| Processing Screen | Animated progress bar across pipeline stages (M1 → M7); status messages |
| Results Screen | Tabbed view: Transcript \| Speakers \| Sounds \| Intensity — all from M1–M7 |
| Speaker Profiles Screen | List of registered speakers; "Add Speaker" flow with voice sample recording |
| Live Dashboard Screen | Full-screen real-time view with 5 panels (M8); Start/Stop button |
| Settings Screen | API key config, model selection, chunk size, confidence threshold |

---

## 5. 24-Hour Execution Timeline

| Time Block | Task |
|---|---|
| 00:00 – 01:00 | Project setup: Expo init, folder structure, install dependencies, configure API keys |
| 01:00 – 02:30 | M1: AssemblyAI integration, file upload, diarization API call, speaker count display |
| 02:30 – 04:00 | M2: Parse utterances, build transcript UI with speaker color coding |
| 04:00 – 05:30 | M3: Speaker profile CRUD screen, embedding storage, similarity matching |
| 05:30 – 06:30 | M4: Background separation — integrate Demucs backend or spectral gate |
| 06:30 – 07:30 | Break + buffer for debugging M1–M4 |
| 07:30 – 09:00 | M5: TensorFlow.js YAMNet integration, category mapping, category card UI |
| 09:00 – 10:00 | M6: Distance estimation logic (RMS + reverb heuristics), badge UI |
| 10:00 – 11:00 | M7: Intensity computation, VU bar UI |
| 11:00 – 12:00 | Results screen polish: tabbed layout, finalize M1–M7 flow end-to-end |
| 12:00 – 13:00 | Break + buffer |
| 13:00 – 15:00 | M8: Live audio capture, WebSocket streaming to AssemblyAI, live transcript panel |
| 15:00 – 16:30 | M8: Real-time sound classification on live chunks, update all 5 dashboard panels |
| 16:30 – 18:00 | M8: Full live dashboard integration, start/stop, latency tuning |
| 18:00 – 19:30 | Integration testing: end-to-end flows for Phase 1 and Phase 2 |
| 19:30 – 21:00 | UI polish: loading states, error handling, empty states, animations |
| 21:00 – 22:30 | Bug fixes, edge case handling, performance optimization |
| 22:30 – 23:30 | Demo preparation: prepare test audio files, rehearse demo flow |
| 23:30 – 24:00 | Final submission: cleanup, README, build APK / Expo Go QR code |

---

## 6. Key API Reference

### 6.1 AssemblyAI — Diarization

```
POST /v2/transcript
Body: { audio_url: '...', speaker_labels: true, speakers_expected: null }
Response: { utterances: [{ speaker, text, start, end }] }
Polling: GET /v2/transcript/{id} until status === 'completed'
```

### 6.2 AssemblyAI — Real-Time WebSocket (M8)

```
wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000
Send:    PCM audio chunks as binary WebSocket messages
Receive: { message_type: 'FinalTranscript' | 'PartialTranscript', text, words }
Auth:    token passed as query param
```

### 6.3 TensorFlow.js YAMNet (M5)

```
Model:   @tensorflow-models/yamnet
Input:   Float32Array of waveform samples at 16kHz
Output:  scores[521] — top-k classes mapped to 5 custom categories
Runtime: ~80ms per 1-second chunk on modern device
```

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AssemblyAI rate limits | Cache responses; use a single API key with proper retry logic |
| Large file upload time | Cap file size at 10MB; show progress indicator |
| YAMNet accuracy on mobile | Use top-3 predictions; fallback to "Unknown Sound" if confidence < 0.4 |
| Demucs backend too slow | Pre-run separation server-side; cache result; use spectral gate as fallback |
| Live WebSocket drops | Auto-reconnect with exponential backoff; show "Reconnecting…" state |
| M8 latency > 3s | Reduce chunk size to 1.5s; use partial transcripts for immediacy |
| Speaker recognition low accuracy | Require 30s voice sample minimum; clearly show confidence % |
| Scope creep in 24hrs | Phase 2 (M8) is stretch goal — deliver M1–M7 first, then add live |

---

## 8. Acceptance Criteria

| Milestone | Success Criteria |
|---|---|
| M1 — Speaker Count | Correctly counts speakers in a 5-minute multi-speaker test file |
| M2 — Transcript | Full transcript with speaker labels, < 10% WER on clear audio |
| M3 — Recognition | Identifies 2 pre-registered speakers with > 85% accuracy |
| M4 — Separation | Background stream is audibly free of speech content |
| M5 — Categorization | Correctly categorizes > 80% of sound events in test audio |
| M6 — Distance | Near/Mid/Far labels align with known spatial setup in test audio |
| M7 — Intensity | Loud sounds labeled High, quiet sounds labeled Low, consistently |
| M8 — Live | Live dashboard updates within 3 seconds of audio input with all panels active |

---

## 9. Recommended Project Structure

```
/src
  /screens            — HomeScreen, ProcessingScreen, ResultsScreen, LiveScreen, ProfilesScreen
  /components         — TranscriptBubble, SpeakerCard, SoundCard, IntensityBar, DistanceBadge
  /services           — assemblyai.js, yamnet.js, demucs.js, speakerRecognition.js
  /hooks              — useAudioUpload, useLiveTranscription, useSoundClassifier
  /store              — useAppStore.js (Zustand)
  /utils              — audioUtils.js, similarityUtils.js, distanceUtils.js
  /models             — yamnet/ (local TFLite model files)
  /constants          — soundCategories.js, colorMap.js, apiConfig.js
/assets               — icons, audio test files
App.js                — Navigation root (React Navigation Stack)
```

---
