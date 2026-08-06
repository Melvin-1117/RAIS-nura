import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PORT = '8000';
const FALLBACK_API_BASE_URL = 'https://melvin1117-audio-intel-backend.hf.space';

export const parseUrl = (urlStr: string): { protocol: string; hostname: string; port: string } => {
  try {
    const match = urlStr.match(/^(https?:)\/\/([^/:]+)(?::(\d+))?/i);
    if (match) {
      return {
        protocol: match[1] || 'http:',
        hostname: match[2] || 'localhost',
        port: match[3] || '',
      };
    }
  } catch {
    // fallback
  }
  return { protocol: 'http:', hostname: 'localhost', port: '' };
};

const extractHostFromScriptUrl = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) {
    return null;
  }

  try {
    const match = scriptURL.match(/^https?:\/\/([^/:]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const extractHostFromExpoConfig = (): string | null => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) {
    return null;
  }

  const [host] = hostUri.split(':');
  return host || null;
};

const extractHostFromWebLocation = (): string | null => {
  if (Platform.OS !== 'web') {
    return null;
  }

  const host = globalThis?.location?.hostname;
  return host || null;
};

export const getDefaultApiBaseUrl = (): string => {
  const host =
    extractHostFromWebLocation() ??
    extractHostFromScriptUrl() ??
    extractHostFromExpoConfig();
  if (!host) {
    return FALLBACK_API_BASE_URL;
  }

  return `http://${host}:${DEFAULT_API_PORT}`;
};
