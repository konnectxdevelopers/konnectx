import { Redirect } from 'expo-router';
import { nextRouteForUser, useAuth } from '../../auth/AuthProvider';

export default function DashboardIndexRoute() {
  const { session } = useAuth();
  if (session?.user) {
    return <Redirect href={nextRouteForUser(session.user)} />;
  }
  return <Redirect href="/home" />;
}
