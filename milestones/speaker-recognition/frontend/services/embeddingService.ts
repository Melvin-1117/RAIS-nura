import { Platform } from 'react-native';

const TARGET_SAMPLE_RATE = 16000;
const MEL_BINS = 80;
const FRAME_LENGTH = 400; // 25ms at 16kHz
const HOP_LENGTH = 160; // 10ms at 16kHz
const FFT_SIZE = 512;
const EMBEDDING_DIM = 192;

type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type OrtTensorConstructor = new (
  type: 'float32',
  data: Float32Array,
  dims: number[]
) => { data: Float32Array | number[] };

let InferenceSessionCtor: { create: (model: unknown) => Promise<OrtSession> } | null = null;
let TensorCtor: OrtTensorConstructor | null = null;
let sessionPromise: Promise<OrtSession> | null = null;
let didLogIO = false;

const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);

const createHammingWindow = (size: number): Float32Array => {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
};

const MEL_FILTERBANK = (() => {
  const lowMel = hzToMel(0);
  const highMel = hzToMel(TARGET_SAMPLE_RATE / 2);
  const melPoints: number[] = [];
  for (let i = 0; i < MEL_BINS + 2; i += 1) {
    melPoints.push(lowMel + ((highMel - lowMel) * i) / (MEL_BINS + 1));
  }

  const hzPoints = melPoints.map(melToHz);
  const fftBins = hzPoints.map((hz) => Math.floor(((FFT_SIZE + 1) * hz) / TARGET_SAMPLE_RATE));

  const filters: Float32Array[] = [];
  for (let m = 1; m <= MEL_BINS; m += 1) {
    const filter = new Float32Array(FFT_SIZE / 2 + 1);
    const left = fftBins[m - 1];
    const center = fftBins[m];
    const right = fftBins[m + 1];

    for (let k = left; k < center; k += 1) {
      if (k >= 0 && k < filter.length) {
        filter[k] = (k - left) / Math.max(1, center - left);
      }
    }
    for (let k = center; k < right; k += 1) {
      if (k >= 0 && k < filter.length) {
        filter[k] = (right - k) / Math.max(1, right - center);
      }
    }

    filters.push(filter);
  }

  return filters;
})();

const HAMMING_WINDOW = createHammingWindow(FRAME_LENGTH);

const resampleTo16k = (audio: Float32Array, sourceRate: number): Float32Array => {
  if (sourceRate === TARGET_SAMPLE_RATE) {
    return audio;
  }

  const ratio = TARGET_SAMPLE_RATE / sourceRate;
  const outputLength = Math.max(1, Math.round(audio.length * ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i / ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(audio.length - 1, left + 1);
    const alpha = sourceIndex - left;
    output[i] = (1 - alpha) * audio[left] + alpha * audio[right];
  }

  return output;
};

const computePowerSpectrum = (frame: Float32Array): Float32Array => {
  const spectrum = new Float32Array(FFT_SIZE / 2 + 1);

  for (let k = 0; k <= FFT_SIZE / 2; k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < FFT_SIZE; n += 1) {
      const sample = n < frame.length ? frame[n] : 0;
      const angle = (2 * Math.PI * k * n) / FFT_SIZE;
      real += sample * Math.cos(angle);
      imag -= sample * Math.sin(angle);
    }
    spectrum[k] = (real * real + imag * imag) / FFT_SIZE;
  }

  return spectrum;
};

const normalizeFeatures = (features: Float32Array): Float32Array => {
  if (features.length === 0) {
    return features;
  }

  let sum = 0;
  for (let i = 0; i < features.length; i += 1) {
    sum += features[i];
  }
  const mean = sum / features.length;

  let varSum = 0;
  for (let i = 0; i < features.length; i += 1) {
    const diff = features[i] - mean;
    varSum += diff * diff;
  }
  const std = Math.sqrt(varSum / features.length) || 1;

  const normalized = new Float32Array(features.length);
  for (let i = 0; i < features.length; i += 1) {
    normalized[i] = (features[i] - mean) / std;
  }

  return normalized;
};

const audioToLogMel = (audio: Float32Array): { features: Float32Array; frames: number } => {
  const frameCount = Math.max(1, Math.floor((audio.length - FRAME_LENGTH) / HOP_LENGTH) + 1);
  const output = new Float32Array(frameCount * MEL_BINS);

  for (let frameIdx = 0; frameIdx < frameCount; frameIdx += 1) {
    const start = frameIdx * HOP_LENGTH;
    const frame = new Float32Array(FRAME_LENGTH);

    for (let i = 0; i < FRAME_LENGTH; i += 1) {
      const sample = audio[start + i] ?? 0;
      frame[i] = sample * HAMMING_WINDOW[i];
    }

    const powerSpectrum = computePowerSpectrum(frame);

    for (let melIdx = 0; melIdx < MEL_BINS; melIdx += 1) {
      const filter = MEL_FILTERBANK[melIdx];
      let energy = 0;
      for (let k = 0; k < filter.length; k += 1) {
        energy += powerSpectrum[k] * filter[k];
      }
      output[frameIdx * MEL_BINS + melIdx] = Math.log(Math.max(1e-10, energy));
    }
  }

  return { features: normalizeFeatures(output), frames: frameCount };
};

const getSession = async (): Promise<OrtSession> => {
  if (Platform.OS === 'web') {
    throw new Error('Speaker recognition embedding inference is not supported on web builds. Use Android or iOS.');
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        if (!InferenceSessionCtor || !TensorCtor) {
          const ort = await import('onnxruntime-react-native');
          InferenceSessionCtor = ort.InferenceSession as unknown as {
            create: (model: unknown) => Promise<OrtSession>;
          };
          TensorCtor = ort.Tensor as OrtTensorConstructor;
        }

        const model = require('../../assets/models/ecapa_tdnn.onnx');
        if (!InferenceSessionCtor) {
          throw new Error('ONNX session factory is unavailable.');
        }

        const session = await InferenceSessionCtor.create(model);

        if (!didLogIO) {
          didLogIO = true;
          console.log('[ECAPA] inputNames:', session.inputNames);
          console.log('[ECAPA] outputNames:', session.outputNames);
        }

        return session;
      } catch {
        throw new Error('ECAPA-TDNN model not found at assets/models/ecapa_tdnn.onnx');
      }
    })();
  }

  return sessionPromise;
};

export const ensureEmbeddingModelLoaded = async (): Promise<void> => {
  await getSession();
};

export const extractEmbedding = async (
  audioFloat32: Float32Array,
  sampleRate: number
): Promise<number[]> => {
  if (!audioFloat32 || audioFloat32.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const session = await getSession();
  const mono16k = resampleTo16k(audioFloat32, sampleRate);
  const { features, frames } = audioToLogMel(mono16k);

  const inputName = session.inputNames[0] || 'input';
  const outputName = session.outputNames[0] || 'output';

  if (!TensorCtor) {
    throw new Error('ONNX tensor constructor is unavailable.');
  }

  const inputTensor = new TensorCtor('float32', features, [1, frames, MEL_BINS]);
  const outputMap = await session.run({ [inputName]: inputTensor });
  const outputTensor = outputMap[outputName] as { data: Float32Array | number[] } | undefined;

  if (!outputTensor) {
    throw new Error('Embedding model output tensor missing');
  }

  const raw = Array.from(outputTensor.data as Float32Array | number[]);
  if (raw.length !== EMBEDDING_DIM) {
    throw new Error(`Expected 192-dim embedding, got ${raw.length}`);
  }

  return raw;
};
