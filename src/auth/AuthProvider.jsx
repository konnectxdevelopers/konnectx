import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { router } from 'expo-router';
import { registerAuthExpiredHandler } from '../services/api/apiClient';
import {
  requestOtp,
  requestPasswordReset as requestPasswordResetRequest,
  confirmPasswordReset as confirmPasswordResetRequest,
  signIn as signInRequest,
  signUp as signUpRequest,
  updateProfile as updateProfileRequest,
  verifyOtp as verifyOtpRequest,
} from '../services/auth/authService';
import { roleCapabilities, roleSides, rolesBySlug } from '../features/roles/roles';
import {
  getCurrentUserRequest,
  selectRoleRequest,
} from '../services/profiles/roleProfileService';

const AuthContext = createContext(null);

const HIRING_CAPABILITIES = ['customer', 'business'];
const OFFERING_CAPABILITIES = ['professional', 'business', 'provider'];

export function canHire(user) {
  return Boolean(
    user?.capabilities?.some((capability) => HIRING_CAPABILITIES.includes(capability))
  );
}

export function canOffer(user) {
  return Boolean(
    user?.capabilities?.some((capability) => OFFERING_CAPABILITIES.includes(capability))
  );
}

function withValidMode(user) {
  if (!user) {
    return user;
  }

  if (user.activeMode === 'offering' && !canOffer(user)) {
    return { ...user, activeMode: 'hiring' };
  }
  if (user.activeMode === 'hiring' && !canHire(user)) {
    return { ...user, activeMode: 'offering' };
  }
  return user;
}

function addRoleToSession(session, roleSlug) {
  const capability = roleCapabilities[roleSlug];
  const capabilities = Array.from(new Set([...(session.user.capabilities || []), capability]));
  const existingRoles = session.user.roles || [];
  const hasRole = existingRoles.some((item) =>
    typeof item === 'string' ? item === roleSlug : item.role === roleSlug
  );
  const roles = hasRole
    ? existingRoles
    : [...existingRoles, { role: roleSlug, profileCompletionStatus: 'incomplete' }];
  return {
    ...session,
    user: {
      ...session.user,
      selectedRole: roleSlug,
      primaryType: capability,
      capabilities,
      roles,
      activeMode: roleSides[roleSlug],
    },
  };
}

async function persistRoleSelection(session, roleSlug) {
  if (!rolesBySlug[roleSlug]) {
    throw new Error('Choose a supported account type.');
  }
  await selectRoleRequest(session, roleSlug);
  return addRoleToSession(session, roleSlug);
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const ready = true;

  useEffect(
    () =>
      registerAuthExpiredHandler(() => {
        setSession(null);
        router.replace('/login');
      }),
    []
  );

  const applySession = useCallback(async (next) => {
    const normalized = next ? { ...next, user: withValidMode(next.user) } : null;
    setSession(normalized);
    return normalized;
  }, []);

  const signUp = useCallback(
    async (details) => {
      const { selectedRole, ...signupDetails } = details;
      const result = await signUpRequest(signupDetails);
      if (!result.session) {
        return result;
      }

      const nextSession = selectedRole
        ? await persistRoleSelection(result.session, selectedRole)
        : result.session;
      return { ...result, session: await applySession(nextSession) };
    },
    [applySession]
  );

  const signIn = useCallback(
    async (details) => applySession(await signInRequest(details)),
    [applySession]
  );

  const requestVerification = useCallback(
    (email) => requestOtp(email),
    []
  );

  const requestPasswordReset = useCallback(
    (email) => requestPasswordResetRequest(email),
    []
  );

  const confirmPasswordReset = useCallback(
    (details) => confirmPasswordResetRequest(details),
    []
  );

  const verifyOtp = useCallback(
    async (details) => {
      const { selectedRole, ...verificationDetails } = details;
      const verifiedSession = await verifyOtpRequest(verificationDetails);
      const nextSession = selectedRole
        ? await persistRoleSelection(verifiedSession, selectedRole)
        : verifiedSession;
      return applySession(nextSession);
    },
    [applySession]
  );

  const selectRole = useCallback(
    async (roleSlug) => {
      if (!session) {
        throw new Error('Sign in before choosing an account type.');
      }
      const selected = await persistRoleSelection(session, roleSlug);
      return applySession(selected);
    },
    [applySession, session]
  );

  const refreshUser = useCallback(async () => {
    if (!session) {
      return null;
    }
    const currentUser = await getCurrentUserRequest(session);
    if (!currentUser) {
      return session;
    }
    return applySession({
      ...session,
      user: {
        ...session.user,
        ...currentUser,
        profile: { ...session.user.profile, ...currentUser.profile },
      },
    });
  }, [applySession, session]);

  const updateProfile = useCallback(
    async (patch) => {
      if (!session) {
        return null;
      }
      const next = await updateProfileRequest(session, patch);
      return applySession(next);
    },
    [applySession, session]
  );

  const setActiveMode = useCallback(
    async (mode) => {
      if (!session) {
        return null;
      }
      const allowed = mode === 'offering' ? canOffer(session.user) : canHire(session.user);
      if (!allowed) {
        return session;
      }
      return updateProfile({ activeMode: mode });
    },
    [session, updateProfile]
  );

  const setCapability = useCallback(
    async (capability, enabled) => {
      if (!session) {
        return null;
      }
      const current = new Set(session.user.capabilities || []);
      if (enabled) {
        current.add(capability);
      } else {
        current.delete(capability);
      }

      if (current.size === 0) {
        throw new Error('At least one account type is required.');
      }

      const capabilities = Array.from(current);
      const nextMode =
        session.user.activeMode === 'offering' && !capabilities.some((item) => OFFERING_CAPABILITIES.includes(item))
          ? 'hiring'
          : session.user.activeMode === 'hiring' && !capabilities.some((item) => HIRING_CAPABILITIES.includes(item))
            ? 'offering'
            : session.user.activeMode;

      return updateProfile({ capabilities, activeMode: nextMode });
    },
    [session, updateProfile]
  );

  const signOut = useCallback(async () => {
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      ready,
      canHire: canHire(session?.user),
      canOffer: canOffer(session?.user),
      activeMode: session?.user?.activeMode || 'hiring',
      signUp,
      signIn,
      requestVerification,
      requestPasswordReset,
      confirmPasswordReset,
      verifyOtp,
      selectRole,
      refreshUser,
      updateProfile,
      setActiveMode,
      setCapability,
      signOut,
    }),
    [
      session,
      ready,
      signUp,
      signIn,
      requestVerification,
      requestPasswordReset,
      confirmPasswordReset,
      verifyOtp,
      selectRole,
      refreshUser,
      updateProfile,
      setActiveMode,
      setCapability,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}

/**
 * Decides where a freshly authenticated user should land.
 */
export function nextRouteForUser(user) {
  if (!user) {
    return '/welcome';
  }
  const role = user.selectedRole || user.profile?.registration?.selectedRole;
  if (!role || !rolesBySlug[role]) {
    return '/home';
  }
  const roleRecord = (user.roles || []).find((item) =>
    typeof item === 'string' ? item === role : item.role === role
  );
  return roleRecord?.profileCompletionStatus === 'complete'
    ? `/dashboard/${role}`
    : `/role-profile/${role}`;
}
