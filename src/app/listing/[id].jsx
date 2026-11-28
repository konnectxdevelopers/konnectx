import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppModal,
  ErrorState,
  InlineAlert,
  LoadingState,
  useToast,
} from '../../components/ui';
import ListingPreviewContent from '../../features/marketplace/ListingPreviewContent';
import {
  getPublicListingDetailRequest,
  getSavedListingPreviewRequest,
  saveFavoriteRequest,
  sendEnquiryRequest,
} from '../../services/marketplace/marketplaceService';
import { colors, spacing } from '../../theme/tokens';

export default function UnifiedListingDetailScreen() {
  const params = useLocalSearchParams();
  const listingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isPreview = (Array.isArray(params.preview) ? params.preview[0] : params.preview) === '1';
  const { session } = useAuth();
  const toast = useToast();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      if (!listingId) {
        setLoading(false);
        setError('Listing ID is missing.');
        return;
      }
      setLoading(true);
      const req = isPreview && session?.token
        ? getSavedListingPreviewRequest(session, listingId).then((r) => r.preview)
        : getPublicListingDetailRequest(listingId).then((r) => r.listing);
      req
        .then((item) => {
          if (active) {
            setListing(item);
            setError(null);
          }
        })
        .catch((err) => {
          if (active) setError(err?.message || 'Listing could not be loaded.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => { active = false; };
  }, [isPreview, listingId, session]);

  const handleSaveFavorite = async () => {
    try {
      await saveFavoriteRequest(session, listing.listingType, listing.id);
      toast?.show?.('Saved to favorites.', { variant: 'success' });
    } catch (err) {
      setError(err?.message || 'Could not save listing.');
    }
  };

  const handleEnquiry = async () => {
    if (!enquiryMessage.trim()) return;
    setSending(true);
    try {
      await sendEnquiryRequest(session, listing.listingType, listing.id, enquiryMessage.trim());
      setEnquiryOpen(false);
      setEnquiryMessage('');
      toast?.show?.('Enquiry sent.', { variant: 'success' });
    } catch (err) {
      setError(err?.message || 'Could not send enquiry.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppHeader onBack={() => router.back()} showBack title={isPreview ? 'Listing Preview' : 'Listing Details'} />
        <LoadingState message="Loading listing..." />
      </SafeAreaView>
    );
  }
  if (error && !listing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AppHeader onBack={() => router.back()} showBack title={isPreview ? 'Listing Preview' : 'Listing Details'} />
        <View style={styles.errorWrap}>
          <ErrorState message={error} onRetry={() => router.back()} retryLabel="Go back" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader onBack={() => router.back()} showBack title={isPreview ? 'Listing Preview' : 'Listing Details'} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <InlineAlert message={error} variant="error" /> : null}
        <ListingPreviewContent isPreview={isPreview} listing={listing} />
        {!isPreview && session?.token && listing ? (
          <View style={styles.actions}>
            <AppButton onPress={handleSaveFavorite} style={styles.flex} title="Save" variant="outline" />
            <AppButton onPress={() => setEnquiryOpen(true)} style={styles.flex} title="Enquire" variant="cta" />
          </View>
        ) : null}
      </ScrollView>

      <AppModal
        actions={(
          <>
            <AppButton loading={sending} onPress={handleEnquiry} title="Send enquiry" />
            <AppButton onPress={() => setEnquiryOpen(false)} title="Cancel" variant="outline" />
          </>
        )}
        onClose={() => setEnquiryOpen(false)}
        title="Send Enquiry"
        visible={enquiryOpen}
      >
        <AppInput
          label="Message"
          maxLength={3000}
          multiline
          onChangeText={setEnquiryMessage}
          placeholder="Tell the listing owner what you need."
          value={enquiryMessage}
        />
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  errorWrap: { padding: spacing.lg, flex: 1, justifyContent: 'center' },
});
