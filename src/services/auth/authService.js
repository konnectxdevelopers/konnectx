import { API_BASE_URL, apiRequest } from '../api/apiClient';

const REMOTE_CONFIGURED = Boolean(API_BASE_URL?.trim());

const ENDPOINTS = {
  signup: '/auth/signup',
  login: '/auth/login',
  emailVerificationRequest: '/auth/email-verification/request',
  emailVerificationVerify: '/auth/email-verification/verify',
  passwordResetRequest: '/auth/password-reset/request',
  passwordResetConfirm: '/auth/password-reset/confirm',
  profile: '/auth/profile',
};

export class AuthError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function emptyProfile(name = '') {
  return {
    displayName: name,
    avatarUri: null,
    headline: '',
    bio: '',
    phone: '',
    location: null,
    skills: [],
    categories: [],
    businessName: '',
  };
}

function normalizeRemoteUser(payload, fallbackEmail) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const rawUser = data.user || data.account || data.profile || null;

  if (!rawUser || typeof rawUser !== 'object') {
    throw new AuthError(
      'unexpected_response',
      'The authentication API returned an unexpected response.'
    );
  }

  return {
    id: rawUser.id || rawUser.userId || rawUser.email || fallbackEmail,
    name: rawUser.name || rawUser.fullName || '',
    email: rawUser.email || fallbackEmail,
    emailVerified: Boolean(rawUser.emailVerified ?? rawUser.verified ?? true),
    phone: rawUser.phone || null,
    phoneVerified: Boolean(rawUser.phoneVerified),
    capabilities: rawUser.capabilities || rawUser.roles || [],
    primaryType: rawUser.primaryType || rawUser.accountType || null,
    activeMode: rawUser.activeMode || 'hiring',
    selectedRole: rawUser.selectedRole || null,
    roles: rawUser.roles || [],
    profile: {
      ...emptyProfile(rawUser.name || ''),
      ...(rawUser.profile || {}),
    },
    createdAt: rawUser.createdAt || null,
  };
}

function normalizeRemoteSession(payload, fallbackEmail) {
  const token = payload?.token || payload?.accessToken || payload?.jwt;
  if (!token) {
    throw new AuthError(
      'missing_token',
      'The authentication API did not return a session token.'
    );
  }

  return {
    mode: 'remote',
    token,
    user: normalizeRemoteUser(payload, fallbackEmail),
  };
}

async function remoteRequest(path, options = {}) {
  if (!REMOTE_CONFIGURED) {
    throw new AuthError(
      'api_not_configured',
      'The online service is not configured. Set EXPO_PUBLIC_API_URL and restart Expo.'
    );
  }

  try {
    return await apiRequest(path, options);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(error.code || 'network', error.message, error.details);
  }
}

export async function signUp({ name, email, phone = null, password }) {
  const cleanEmail = normalizeEmail(email);
  const payload = await remoteRequest(ENDPOINTS.signup, {
    method: 'POST',
    body: JSON.stringify({ name, email: cleanEmail, phone, password }),
  });

  if (payload?.verificationRequired !== true) {
    throw new AuthError(
      'unexpected_response',
      'The authentication API did not request email verification.'
    );
  }

  return {
    mode: 'remote',
    pendingEmail: normalizeEmail(payload.email || cleanEmail),
    session: null,
  };
}

export async function signIn({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const payload = await remoteRequest(ENDPOINTS.login, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, password }),
  });
  return normalizeRemoteSession(payload, cleanEmail);
}

export async function requestOtp(email) {
  const cleanEmail = normalizeEmail(email);
  await remoteRequest(ENDPOINTS.emailVerificationRequest, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail }),
  });
  return { mode: 'remote' };
}

export async function verifyOtp({ email, code }) {
  const cleanEmail = normalizeEmail(email);
  const payload = await remoteRequest(ENDPOINTS.emailVerificationVerify, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, code }),
  });
  return normalizeRemoteSession(payload, cleanEmail);
}

export async function requestPasswordReset(email) {
  const cleanEmail = normalizeEmail(email);
  return remoteRequest(ENDPOINTS.passwordResetRequest, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail }),
  });
}

export async function confirmPasswordReset({ email, code, password }) {
  const cleanEmail = normalizeEmail(email);
  return remoteRequest(ENDPOINTS.passwordResetConfirm, {
    method: 'POST',
    body: JSON.stringify({ email: cleanEmail, code, password }),
  });
}

export async function updateProfile(session, patch) {
  if (!session?.token || !session?.user?.email) {
    throw new AuthError('not_signed_in', 'Sign in before updating your account.');
  }

  const payload = await remoteRequest(ENDPOINTS.profile, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(patch),
  });

  return {
    ...session,
    user: {
      ...session.user,
      ...normalizeRemoteUser(payload, session.user.email),
    },
  };
}
