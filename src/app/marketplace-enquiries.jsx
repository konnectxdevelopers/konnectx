import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AppButton, AppHeader, AppText, InlineAlert, LoadingState } from '../components/ui';
import {
  listEnquiriesRequest,
  updateEnquiryRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';

export default function MarketplaceEnquiriesScreen() {
  const params = useLocalSearchParams();
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = requestedView === 'sent' ? 'sent' : 'received';
  const { session } = useAuth();
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listEnquiriesRequest(session, view);
      setEnquiries(response.enquiries || []);
    } catch (requestError) {
      setError(requestError?.message || 'Could not load enquiries.');
    } finally {
      setLoading(false);
    }
  }, [session, view]);

  useEffect(() => {
    Promise.resolve().then(loadEnquiries);
  }, [loadEnquiries]);

  const setStatus = async (id, status) => {
    try {
      await updateEnquiryRequest(session, id, status);
      setEnquiries((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } catch (requestError) {
      setError(requestError?.message || 'Could not update enquiry status.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader onBack={() => router.back()} showBack title={view === 'sent' ? 'Sent enquiries' : 'Received enquiries'} />
      {loading ? <LoadingState message="Loading enquiries..." /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <InlineAlert message={error} variant="error" /> : null}
          {enquiries.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.heading}>
                <AppText variant="label" color={colors.text}>
                  {item.listingType} · {item.status}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </AppText>
              </View>
              <AppText variant="caption" color={colors.muted}>
                Listing {item.listingId}
              </AppText>
              <AppText variant="body" color={colors.textSecondary}>
                {item.message}
              </AppText>
              {view === 'received' && item.status !== 'closed' ? (
                <View style={styles.actions}>
                  {item.status !== 'replied' ? (
                    <AppButton onPress={() => setStatus(item.id, 'replied')} size="sm" title="Mark replied" variant="secondary" />
                  ) : null}
                  <AppButton onPress={() => setStatus(item.id, 'closed')} size="sm" title="Close" variant="outline" />
                </View>
              ) : null}
            </View>
          ))}
          {!enquiries.length ? (
            <AppText variant="body" color={colors.muted}>
              {view === 'sent' ? 'You have not sent any enquiries yet.' : 'No enquiries have arrived yet.'}
            </AppText>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
