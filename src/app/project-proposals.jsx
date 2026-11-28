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
  getOwnerProposalsRequest,
  getProposalAttachmentUrlRequest,
  updateProposalStatusRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';

const PROP_TABS = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'selected', label: 'Selected' },
  { key: 'declined', label: 'Declined' },
];

const NEXT_STATUSES = ['shortlisted', 'selected', 'declined'];

function propVariant(status) {
  if (status === 'selected' || status === 'shortlisted') return 'success';
  if (status === 'declined') return 'danger';
  return 'neutral';
}

export default function ProjectProposalsScreen() {
  const { projectId } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedProp, setSelectedProp] = useState(null);
  const [nextStatus, setNextStatus] = useState('shortlisted');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProposals = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOwnerProposalsRequest(session, {
        ...(projectId ? { projectId: String(projectId) } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });
      setItems(res.items || []);
    } catch (err) {
      setError(err?.message || 'Could not load proposals.');
    } finally {
      setLoading(false);
    }
  }, [projectId, session, statusFilter]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getOwnerProposalsRequest(session, {
      ...(projectId ? { projectId: String(projectId) } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    })
      .then((res) => {
        if (!active) return;
        setItems(res.items || []);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load proposals.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, session, statusFilter]);

  const openManage = (prop) => {
    setSelectedProp(prop);
    setNextStatus(prop.status === 'submitted' ? 'shortlisted' : prop.status);
    setInternalNotes(prop.internalNotes || '');
  };

  const handleSave = async () => {
    if (!selectedProp) return;
    setSaving(true);
    try {
      await updateProposalStatusRequest(session, selectedProp.id, {
        status: nextStatus,
        internalNotes: internalNotes.trim() || null,
      });
      setSelectedProp(null);
      showToast('Proposal updated.', 'success');
      await loadProposals();
    } catch (err) {
      showToast(err?.message || 'Could not update proposal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async (propId, attId) => {
    try {
      const res = await getProposalAttachmentUrlRequest(session, propId, attId);
      if (res.url) await Linking.openURL(res.url);
    } catch (err) {
      showToast(err?.message || 'Could not open attachment.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader onBack={() => router.back()} showBack subtitle="Review & select" title="Project Proposals" />

      <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
        {PROP_TABS.map((tab) => {
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

      {loading ? (
        <LoadingState message="Loading proposals..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadProposals} />
      ) : !items.length ? (
        <EmptyState
          icon="file-document-outline"
          message="Proposals submitted by professionals and businesses will appear here."
          title="No proposals yet"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((prop) => (
            <View key={prop.id} style={styles.card}>
              <View style={styles.headRow}>
                <View style={styles.headCopy}>
                  <AppText variant="h4" color={colors.text}>{prop.proposerName}</AppText>
                  <AppText variant="caption" color={colors.muted}>{prop.projectTitle}</AppText>
                </View>
                <Badge label={prop.status} variant={propVariant(prop.status)} />
              </View>
              {prop.proposedAmount ? (
                <AppText variant="label" color={colors.primary}>
                  Quote: {prop.currency} {Number(prop.proposedAmount).toLocaleString('en-IN')}
                  {prop.timelineText ? ` · ${prop.timelineText}` : ''}
                </AppText>
              ) : null}
              <AppText variant="body" color={colors.textSecondary} numberOfLines={3}>
                {prop.coverMessage}
              </AppText>
              {prop.relevantSkills?.length ? (
                <View style={styles.wrapRow}>
                  {prop.relevantSkills.map((skill) => <Badge key={skill} label={skill} variant="neutral" />)}
                </View>
              ) : null}
              {prop.portfolioLinks?.length ? (
                <View style={styles.modalStack}>
                  {prop.portfolioLinks.map((link) => (
                    <AppButton
                      key={link}
                      icon="open-in-new"
                      onPress={() => Linking.openURL(link)}
                      size="sm"
                      title={link}
                      variant="outline"
                    />
                  ))}
                </View>
              ) : null}
              {prop.milestones?.length ? (
                <View style={styles.modalStack}>
                  <AppText variant="label" color={colors.text}>Proposed milestones</AppText>
                  {prop.milestones.map((milestone) => (
                    <AppText key={milestone.id} variant="caption" color={colors.textSecondary}>
                      {milestone.sequence}. {milestone.title}
                      {milestone.estimatedDays ? ` · ${milestone.estimatedDays} days` : ''}
                    </AppText>
                  ))}
                </View>
              ) : null}
              <View style={styles.actions}>
                {prop.attachments?.map((att) => (
                  <AppButton
                    key={att.id}
                    icon="file-document-outline"
                    onPress={() => openAttachment(prop.id, att.id)}
                    size="sm"
                    title={att.fileName || 'Attachment'}
                    variant="outline"
                  />
                ))}
                <AppButton onPress={() => openManage(prop)} size="sm" title="Review / Update" />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <AppModal onClose={() => setSelectedProp(null)} title="Review Proposal" visible={Boolean(selectedProp)}>
        <View style={styles.modalStack}>
          <AppText variant="label" color={colors.text}>Decision</AppText>
          <View style={styles.wrapRow}>
            {NEXT_STATUSES.map((st) => (
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
            label="Internal Notes (private)"
            multiline
            onChangeText={setInternalNotes}
            value={internalNotes}
          />
          <AppButton loading={saving} onPress={handleSave} title="Save Decision" />
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
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
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

