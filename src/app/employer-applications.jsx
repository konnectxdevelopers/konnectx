import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppModal,
  AppPressable,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  useToast,
} from '../components/ui';
import {
  getApplicationAttachmentUrlRequest,
  getEmployerApplicationsRequest,
  updateApplicationStatusRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';

const APP_TABS = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offered', label: 'Offered' },
  { key: 'hired', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

const NEXT_STATUSES = {
  submitted: ['reviewing', 'shortlisted', 'rejected'],
  reviewing: ['shortlisted', 'interviewing', 'rejected'],
  shortlisted: ['interviewing', 'offered', 'rejected'],
  interviewing: ['offered', 'rejected'],
  offered: ['hired', 'rejected'],
};

function appStatusVariant(status) {
  if (status === 'hired' || status === 'offered' || status === 'shortlisted') return 'success';
  if (status === 'interviewing') return 'info';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}

export default function EmployerApplicationsScreen() {
  const { jobId, status: initialStatus, role } = useLocalSearchParams();
  const employerRole = Array.isArray(role) ? role[0] : role;
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [loadedQuery, setLoadedQuery] = useState(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus ? String(initialStatus) : 'all');
  const queryKey = JSON.stringify([jobId || null, employerRole || null, statusFilter]);

  const [selectedApp, setSelectedApp] = useState(null);
  const [nextStatus, setNextStatus] = useState('shortlisted');
  const [interviewStage, setInterviewStage] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadApplications = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getEmployerApplicationsRequest(session, {
        ...(jobId ? { jobId: String(jobId) } : {}),
        ...(employerRole ? { role: String(employerRole) } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });
      setItems(res.items || []);
    } catch (err) {
      setError(err?.message || 'Could not load applications.');
    } finally {
      setLoading(false);
      setLoadedQuery(queryKey);
    }
  }, [employerRole, jobId, queryKey, session, statusFilter]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getEmployerApplicationsRequest(session, {
      ...(jobId ? { jobId: String(jobId) } : {}),
      ...(employerRole ? { role: String(employerRole) } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    })
      .then((res) => {
        if (!active) return;
        setItems(res.items || []);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load applications.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoadedQuery(queryKey);
        }
      });
    return () => {
      active = false;
    };
  }, [employerRole, jobId, queryKey, session, statusFilter]);

  const openManage = (app) => {
    setSelectedApp(app);
    setNextStatus(NEXT_STATUSES[app.status]?.[0] || app.status);
    setInterviewStage(app.interviewStage || '');
    setInternalNotes(app.internalNotes || '');
  };

  const handleSaveUpdate = async () => {
    if (!selectedApp) return;
    setSaving(true);
    try {
      await updateApplicationStatusRequest(session, selectedApp.id, {
        status: nextStatus,
        interviewStage: interviewStage.trim() || null,
        internalNotes: internalNotes.trim() || null,
      });
      setSelectedApp(null);
      showToast('Candidate application updated.', 'success');
      await loadApplications();
    } catch (err) {
      showToast(err?.message || 'Could not update application.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAttachment = async (appId, attId) => {
    try {
      const res = await getApplicationAttachmentUrlRequest(session, appId, attId);
      if (res.url) {
        await Linking.openURL(res.url);
      }
    } catch (err) {
      showToast(err?.message || 'Could not open private attachment.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Candidate pipeline"
        title="Applications"
      />

      <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
        {APP_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <AppPressable
              key={tab.key}
              onPress={() => setStatusFilter(tab.key)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <AppText variant="caption" color={active ? colors.inverse : colors.textSecondary}>{tab.label}</AppText>
            </AppPressable>
          );
        })}
      </ScrollView>

      {loading || loadedQuery !== queryKey ? (
        <LoadingState message="Loading candidate applications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadApplications} />
      ) : !items.length ? (
        <EmptyState
          icon="account-search-outline"
          message="Applications submitted to your published jobs will appear here."
          title="No applications yet"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((app) => (
            <View key={app.id} style={styles.card}>
              <View style={styles.headRow}>
                <View style={styles.headCopy}>
                  <AppText variant="h4" color={colors.text}>{app.applicantName}</AppText>
                  <AppText variant="caption" color={colors.muted}>{app.jobTitle}</AppText>
                </View>
                <Badge label={app.status} variant={appStatusVariant(app.status)} />
              </View>
              {app.coverNote ? (
                <AppText variant="body" color={colors.textSecondary} numberOfLines={3}>
                  {app.coverNote}
                </AppText>
              ) : null}
              {app.interviewStage ? (
                <AppText variant="caption" color={colors.primary}>Stage: {app.interviewStage}</AppText>
              ) : null}
              <View style={styles.actions}>
                {app.attachments?.map((att) => (
                  <AppButton
                    key={att.id}
                    icon="file-document-outline"
                    onPress={() => handleOpenAttachment(app.id, att.id)}
                    size="sm"
                    title={att.fileName || 'Resume'}
                    variant="outline"
                  />
                ))}
                <AppButton onPress={() => openManage(app)} size="sm" title="Review / Update" />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <AppModal onClose={() => setSelectedApp(null)} title="Update Candidate Status" visible={Boolean(selectedApp)}>
        <View style={styles.modalStack}>
          <AppText variant="label" color={colors.text}>Status</AppText>
          <View style={styles.wrapRow}>
            {(selectedApp ? NEXT_STATUSES[selectedApp.status] || [selectedApp.status] : []).map((st) => (
              <AppPressable
                key={st}
                onPress={() => setNextStatus(st)}
                style={[styles.pill, nextStatus === st && styles.pillActive]}
              >
                <AppText variant="caption" color={nextStatus === st ? colors.inverse : colors.textSecondary}>{st}</AppText>
              </AppPressable>
            ))}
          </View>
          <AppInput
            label="Interview Stage"
            onChangeText={setInterviewStage}
            placeholder="e.g. Technical Round 1"
            value={interviewStage}
          />
          <AppInput
            label="Internal Notes (private to employer)"
            multiline
            onChangeText={setInternalNotes}
            value={internalNotes}
          />
          <AppButton loading={saving} onPress={handleSaveUpdate} title="Save Status" />
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  rail: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs, maxHeight: 46 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  list: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  headCopy: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  modalStack: { gap: spacing.sm },
});

