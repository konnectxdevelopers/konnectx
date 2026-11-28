import Constants from 'expo-constants';

const DEFAULT_API_PORT = '4000';
const API_REQUEST_TIMEOUT_MS = 20000;
const LOCAL_URL_PATTERN = /^https?:\/\/([^/:]+)(?::(\d+))?/i;
const LOCAL_HOST_PATTERN =
  /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$/;

function devServerHost() {
  // hostUri is the address the device used to reach the Metro bundler, e.g.
  // "192.168.1.67:8081". It always matches the machine running the API.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    '';
  const withoutScheme = String(hostUri).replace(/^[a-z]+:\/\//i, '');
  return withoutScheme.replace(/\/.*$/, '').split(':')[0] || '';
}

function resolveApiBaseUrl() {
  const configured = (process.env.EXPO_PUBLIC_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (__DEV__) {
    const host = devServerHost();
    if (host && LOCAL_HOST_PATTERN.test(host)) {
      const match = configured ? LOCAL_URL_PATTERN.exec(configured) : null;
      const configuredHost = match ? match[1] : '';
      const configuredPort = match && match[2] ? match[2] : DEFAULT_API_PORT;

      // Keep pointing at whatever API URL was configured for remote hosts, but
      // follow the dev machine when the API is local (LAN/localhost) so a new
      // DHCP or hotspot address does not break sign-in.
      if (!configured || (configuredHost && LOCAL_HOST_PATTERN.test(configuredHost))) {
        return `http://${host}:${configuredPort}`;
      }
    }
  }

  return configured;
}

export const API_BASE_URL = resolveApiBaseUrl();

let authExpiredHandler = null;

export function registerAuthExpiredHandler(handler) {
  authExpiredHandler = handler;
  return () => {
    if (authExpiredHandler === handler) {
      authExpiredHandler = null;
    }
  };
}

function hasBearerToken(headers) {
  const authorization = headers?.Authorization || headers?.authorization;
  return typeof authorization === 'string' && /^Bearer\s+\S+$/i.test(authorization);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(
        'The server did not respond in time. Check your connection and try again.',
        { cause: error }
      );
    }
    if (callerSignal?.aborted) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Unable to reach the API. Check the API URL and your network connection.',
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function apiRequest(path, options = {}) {
  if (typeof API_BASE_URL !== 'string' || !API_BASE_URL.trim()) {
    throw new Error('The online service is not configured. Set EXPO_PUBLIC_API_URL and restart Expo.');
  }

  const baseUrl = API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  const response = await fetchWithTimeout(`${baseUrl}/${normalizedPath}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  const responseBody = responseText
    ? contentType.includes('application/json')
      ? JSON.parse(responseText)
      : responseText
    : null;

  if (!response.ok) {
    const message =
      responseBody &&
      typeof responseBody === 'object' &&
      typeof responseBody.message === 'string'
        ? responseBody.message
        : `API request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    if (responseBody && typeof responseBody === 'object') {
      error.code = responseBody.code;
      if (responseBody.details !== undefined) {
        error.details = responseBody.details;
      } else if (responseBody.missing !== undefined) {
        error.details = { missing: responseBody.missing };
      }
    }
    if (response.status === 401 && hasBearerToken(options.headers)) {
      error.code = 'session_expired';
      error.message = 'Your session has expired. Please sign in again.';
      authExpiredHandler?.();
    }
    throw error;
  }

  return responseBody;
}
