import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { rolesBySlug } from '../roles/roles';
import {
  getRoleDashboardRequest,
} from '../../services/profiles/roleProfileService';
import BusinessDashboardScreen from './BusinessDashboardScreen';
import CustomerDashboardScreen from './CustomerDashboardScreen';
import {
  DashboardErrorScreen,
  DashboardLoadingScreen,
} from './DashboardUi';
import HiringDashboardScreen from './HiringDashboardScreen';
import ProfessionalDashboardScreen from './ProfessionalDashboardScreen';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isAssignedToRole(user, role) {
  return (user?.roles || []).some((item) =>
    typeof item === 'string' ? item === role : item.role === role
  );
}

function validDashboardResponse(response, role, userId) {
  return Boolean(
    response &&
    response.role === role &&
    response.user &&
    response.user.id === userId &&
    response.profile &&
    typeof response.profile === 'object' &&
    response.profileCompletion &&
    typeof response.profileCompletion.status === 'string'
  );
}

export default function RoleDashboardScreen() {
  const params = useLocalSearchParams();
  const role = firstParam(params.role);
  const roleInfo = rolesBySlug[role];
  const { session, ready } = useAuth();
  const { t } = useLocale();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorRole, setErrorRole] = useState(null);
  const [redirectingRole, setRedirectingRole] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isAssigned = isAssignedToRole(session?.user, role);
  const canLoad = Boolean(
    ready &&
    session?.token &&
    roleInfo &&
    session.user.selectedRole === role &&
    isAssigned
  );
  const currentDashboard =
    dashboard?.role === role && dashboard?.user?.id === session?.user?.id
      ? dashboard
      : null;

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!roleInfo) {
      router.replace('/home');
    } else if (!session) {
      router.replace('/login');
    } else if (session.user.selectedRole !== role || !isAssigned) {
      router.replace(nextRouteForUser(session.user));
    }
  }, [isAssigned, ready, role, roleInfo, session]);

  useEffect(() => {
    if (!canLoad) {
      return undefined;
    }

    let active = true;
    getRoleDashboardRequest(session, role)
      .then((response) => {
        if (!active) {
          return;
        }
        if (!validDashboardResponse(response, role, session.user.id)) {
          throw new Error('The dashboard API returned incomplete data. Please try again.');
        }
        if (response.profileCompletion.status !== 'complete') {
          setRedirectingRole(role);
          router.replace(`/role-profile/${role}`);
          return;
        }
        setDashboard(response);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError);
          setErrorRole(role);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canLoad, refreshKey, role, session]);

  const refresh = () => {
    setError(null);
    setErrorRole(null);
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const currentError = errorRole === role ? error : null;
  const redirecting = redirectingRole === role;

  if (
    !ready ||
    !canLoad ||
    (!currentDashboard && !currentError) ||
    (loading && !currentDashboard) ||
    redirecting
  ) {
    return <DashboardLoadingScreen />;
  }

  if (!currentDashboard) {
    return <DashboardErrorScreen error={currentError} onRetry={refresh} />;
  }

  const screenProps = {
    dashboard: currentDashboard,
    refreshing: loading,
    onRefresh: refresh,
    error: currentError?.message,
  };
  if (role === 'customer') {
    return <CustomerDashboardScreen {...screenProps} />;
  }
  if (role === 'professional') {
    return <ProfessionalDashboardScreen {...screenProps} />;
  }
  if (role === 'business') {
    return <BusinessDashboardScreen {...screenProps} />;
  }
  if (role === 'hiring') {
    return <HiringDashboardScreen {...screenProps} />;
  }

  return (
    <DashboardErrorScreen
      error={new Error(t('flow.auth.errors.generic'))}
      onRetry={() => router.replace('/home')}
    />
  );
}
