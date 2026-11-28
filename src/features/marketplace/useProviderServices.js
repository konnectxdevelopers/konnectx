import { useCallback, useEffect, useState } from 'react';
import { getMyServicesRequest } from '../../services/marketplace/marketplaceService';

export default function useProviderServices(session, role) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState({
    key: null,
    services: [],
    error: null,
  });
  const queryKey = `${role}:${session?.user?.id || ''}:${refreshKey}`;

  useEffect(() => {
    let active = true;
    if (!session?.token) {
      Promise.resolve().then(() => {
        if (active) {
          setResult({
            key: queryKey,
            services: [],
            error: 'Sign in to load your service listings.',
          });
        }
      });
      return () => {
        active = false;
      };
    }

    getMyServicesRequest(session, { role, status: 'published', limit: 50 })
      .then((response) => {
        if (active) {
          setResult({
            key: queryKey,
            services: response.services || [],
            error: null,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setResult({
            key: queryKey,
            services: [],
            error: error?.message || 'Could not load your published services.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [queryKey, role, session]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const currentResult = result.key === queryKey ? result : null;
  return {
    services: currentResult?.services || [],
    error: currentResult?.error || null,
    loading: !currentResult,
    refresh,
  };
}
