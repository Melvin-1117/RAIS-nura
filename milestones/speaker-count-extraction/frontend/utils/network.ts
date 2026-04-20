import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PORT = '8003';
const FALLBACK_API_BASE_URL = `http://10.0.2.2:${DEFAULT_API_PORT}`;

const extractHostFromScriptUrl = (): string | null => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) {
    return null;
  }

  try {
    return new URL(scriptURL).hostname;
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
