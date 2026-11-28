import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';
import LocaleProvider from '../i18n/LocaleProvider';
import AuthProvider from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <ToastProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" options={{ animation: 'fade' }} />
              <Stack.Screen name="language" options={{ animation: 'fade' }} />
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="home" options={{ animation: 'fade' }} />
              <Stack.Screen name="signup" options={{ animation: 'fade' }} />
              <Stack.Screen name="login" options={{ animation: 'fade' }} />
              <Stack.Screen name="verify-otp" />
              <Stack.Screen name="reset-password" />
              <Stack.Screen name="profile-setup" />
              <Stack.Screen name="role-profile/[role]" />
              <Stack.Screen name="dashboard/index" options={{ animation: 'fade' }} />
              <Stack.Screen name="dashboard/[role]" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="marketplace-manage" />
              <Stack.Screen name="marketplace-enquiries" />
              <Stack.Screen name="my-listings" />
              <Stack.Screen name="listing-editor" />
              <Stack.Screen name="listing/[id]" />
              <Stack.Screen name="business-shop" />
              <Stack.Screen name="manage-products" />
              <Stack.Screen name="product/[id]" />
              <Stack.Screen name="manage-jobs" />
              <Stack.Screen name="employer-applications" />
              <Stack.Screen name="job/[id]" />
              <Stack.Screen name="manage-projects" />
              <Stack.Screen name="project-proposals" />
              <Stack.Screen name="project/discover" />
              <Stack.Screen name="project/[id]" />
            </Stack>
          </ToastProvider>
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
