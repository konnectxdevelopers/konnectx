import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
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
  InlineAlert,
  LoadingState,
  SearchBar,
  useToast,
} from '../components/ui';
import {
  createJobRequest,
  getMarketplaceCategoryTreeRequest,
  getMyJobDetailRequest,
  getMyJobsRequest,
  transitionJobStatusRequest,
  updateJobRequest,
} from '../services/marketplace/marketplaceService';
import { colors, radii, spacing } from '../theme/tokens';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'draft', label: 'Drafts' },
  { key: 'paused', label: 'Paused' },
  { key: 'closed', label: 'Closed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
];

const EMPLOYMENT_TYPES = [
  { key: 'full-time', label: 'Full-time' },
  { key: 'part-time', label: 'Part-time' },
  { key: 'contract', label: 'Contract' },
  { key: 'temporary', label: 'Temporary' },
  { key: 'internship', label: 'Internship' },
];

const WORK_MODES = [
  { key: 'on-site', label: 'On-site' },
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
];

const APPLICATION_METHODS = [
  { key: 'in_app', label: 'In-app' },
  { key: 'external_url', label: 'External URL' },
  { key: 'email', label: 'Email' },
];

const EMPTY_FORM = {
  id: null,
  title: '',
  categoryId: '',
  subcategoryId: '',
  description: '',
  responsibilities: '',
  employmentType: 'full-time',
  workMode: 'on-site',
  location: '',
  experienceMin: '',
  experienceMax: '',
  educationRequired: '',
  salaryMin: '',
  salaryMax: '',
  salaryUndisclosed: false,
  currency: 'INR',
  openings: '1',
  deadline: '',
  skills: '',
  applicationMethod: 'in_app',
  applicationTarget: '',
  applicationQuestions: '',
};

function statusVariant(status) {
  if (status === 'published') return 'success';
  if (status === 'pending_review') return 'warning';
  if (status === 'rejected' || status === 'closed') return 'danger';
  if (status === 'paused') return 'info';
  return 'neutral';
}

export default function ManageJobsScreen() {
  const { role: paramRole } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [categoryTree, setCategoryTree] = useState([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const jobCategories = useMemo(() => {
    const root = categoryTree.find((n) => n.listingType === 'job' || n.slug === 'jobs-employment');
    if (root?.children?.length) return root.children;
    return categoryTree.filter((n) => n.listingType === 'job');
  }, [categoryTree]);
  const selectedCategory = jobCategories.find((category) => category.id === form.categoryId);

  const loadJobs = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyJobsRequest(session, {
        role: paramRole ? String(paramRole) : undefined,
        status: activeTab === 'all' ? undefined : activeTab,
        q: searchText.trim() || undefined,
      });
      setJobs(res.items || []);
      setCounts(res.countsByStatus || {});
    } catch (err) {
      setError(err?.message || 'Could not load jobs.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, paramRole, searchText, session]);

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('job')
      .then((res) => {
        if (active) setCategoryTree(res.tree || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    getMyJobsRequest(session, {
      role: paramRole ? String(paramRole) : undefined,
      status: activeTab === 'all' ? undefined : activeTab,
      q: searchText.trim() || undefined,
    })
      .then((res) => {
        if (!active) return;
        setJobs(res.items || []);
        setCounts(res.countsByStatus || {});
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load jobs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, paramRole, searchText, session]);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      categoryId: jobCategories[0]?.id || '',
    });
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = async (item) => {
    setEditorError(null);
    try {
      const res = await getMyJobDetailRequest(session, item.id);
      const j = res.job || item;
      setForm({
        id: j.id,
        title: j.title || '',
        categoryId: j.categoryId || '',
        subcategoryId: j.subcategoryId || '',
        description: j.description || '',
        responsibilities: j.responsibilities || '',
        employmentType: j.employmentType || 'full-time',
        workMode: j.workMode || 'on-site',
        location: j.location || '',
        experienceMin: j.experienceMin !== null && j.experienceMin !== undefined ? String(j.experienceMin) : '',
        experienceMax: j.experienceMax !== null && j.experienceMax !== undefined ? String(j.experienceMax) : '',
        educationRequired: j.educationRequired || '',
        salaryMin: j.salaryMin !== null && j.salaryMin !== undefined ? String(j.salaryMin) : '',
        salaryMax: j.salaryMax !== null && j.salaryMax !== undefined ? String(j.salaryMax) : '',
        salaryUndisclosed: Boolean(j.salaryUndisclosed),
        currency: j.currency || 'INR',
        openings: String(j.openings || 1),
        deadline: j.deadline ? String(j.deadline).slice(0, 10) : '',
        skills: Array.isArray(j.skills) ? j.skills.join(', ') : '',
        applicationMethod: j.applicationMethod || 'in_app',
        applicationTarget: j.applicationTarget || '',
        applicationQuestions: Array.isArray(j.applicationQuestions) ? j.applicationQuestions.join('\n') : '',
      });
      setEditorOpen(true);
    } catch (err) {
      showToast(err?.message || 'Could not load job details.', 'error');
    }
  };

  const handleSave = async (action) => {
    if (!form.title.trim()) {
      setEditorError('Job title is required.');
      return;
    }
    if (action !== 'save_draft' && (!form.categoryId || !form.description.trim())) {
      setEditorError('Category and job description are required before publishing.');
      return;
    }
    setEditorSaving(true);
    setEditorError(null);
    try {
      const payload = {
        action,
        employerRole: paramRole ? String(paramRole) : undefined,
        title: form.title.trim(),
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        description: form.description.trim(),
        responsibilities: form.responsibilities.trim() || null,
        employmentType: form.employmentType,
        workMode: form.workMode,
        location: form.location.trim() || null,
        experienceMin: form.experienceMin.trim() ? Number(form.experienceMin) : null,
        experienceMax: form.experienceMax.trim() ? Number(form.experienceMax) : null,
        educationRequired: form.educationRequired.trim() || null,
        salaryMin: form.salaryUndisclosed || !form.salaryMin.trim() ? null : Number(form.salaryMin),
        salaryMax: form.salaryUndisclosed || !form.salaryMax.trim() ? null : Number(form.salaryMax),
        salaryUndisclosed: form.salaryUndisclosed,
        currency: form.currency || 'INR',
        openings: form.openings.trim() ? Number(form.openings) : 1,
        deadline: form.deadline.trim() || null,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        applicationMethod: form.applicationMethod,
        applicationTarget: form.applicationTarget.trim() || null,
        applicationQuestions: form.applicationQuestions.split('\n').map((question) => question.trim()).filter(Boolean),
      };
      const result = form.id
        ? await updateJobRequest(session, form.id, payload)
        : await createJobRequest(session, payload);
      setEditorOpen(false);
      const savedStatus = result.job?.status;
      showToast(
        action === 'save_draft'
          ? 'Job draft saved.'
          : savedStatus === 'pending_review'
            ? 'Job submitted for review.'
            : 'Job saved.',
        'success'
      );
      await loadJobs();
    } catch (err) {
      setEditorError(err?.message || 'Could not save job post.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleTransition = (job, action, label) => {
    const run = async () => {
      try {
        await transitionJobStatusRequest(session, job.id, action);
        showToast(`Job ${label.toLowerCase()}.`, 'success');
        await loadJobs();
      } catch (err) {
        showToast(err?.message || `Could not ${label.toLowerCase()} job.`, 'error');
      }
    };
    if (action === 'archive' || action === 'close') {
      Alert.alert(
        `${label} job`,
        `${label} "${job.title}"? Candidates will not be able to apply once closed or archived.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: label, style: 'destructive', onPress: run },
        ]
      );
      return;
    }
    run();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Vacancies & recruitment"
        title="Manage Jobs"
        rightAction={{
          icon: 'account-multiple-outline',
          onPress: () => router.push('/employer-applications'),
        }}
      />

      <View style={styles.topControls}>
        <SearchBar
          onChangeText={setSearchText}
          onSubmit={loadJobs}
          placeholder="Search job title or location..."
          value={searchText}
        />
        <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <AppPressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <AppText variant="caption" color={active ? colors.inverse : colors.textSecondary}>
                  {tab.label}
                  {typeof counts[tab.key] === 'number' ? ` (${counts[tab.key]})` : ''}
                </AppText>
              </AppPressable>
            );
          })}
        </ScrollView>
        <View style={styles.rowBtns}>
          <AppButton containerStyle={styles.flexBtn} icon="plus" onPress={openCreate} size="sm" title="Post a Job" />
          <AppButton
            containerStyle={styles.flexBtn}
            icon="account-multiple-outline"
            onPress={() => router.push('/employer-applications')}
            size="sm"
            title="Applicants"
            variant="secondary"
          />
        </View>
      </View>

      {loading ? (
        <LoadingState message="Loading your job posts..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadJobs} />
      ) : !jobs.length ? (
        <EmptyState
          actionLabel="Post a Job"
          icon="briefcase-plus-outline"
          message="Create job vacancies, review applications, and shortlist candidates."
          onAction={openCreate}
          title="No jobs in this view"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {jobs.map((job) => (
            <View key={job.id} style={styles.card}>
              <View style={styles.badgeRow}>
                <Badge label={job.status.replace('_', ' ')} variant={statusVariant(job.status)} />
                <Badge label={job.employmentType} variant="neutral" />
                <Badge label={job.workMode} variant="neutral" />
              </View>
              <AppText variant="h4" color={colors.text}>{job.title}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {[job.categoryName, job.location, `${job.applicationCount ?? 0} applicants`].filter(Boolean).join(' · ')}
              </AppText>
              {job.status === 'rejected' && job.moderationReason ? (
                <InlineAlert message={`Moderation reason: ${job.moderationReason}`} variant="error" />
              ) : null}
              <View style={styles.actions}>
                <AppButton onPress={() => openEdit(job)} size="sm" title="Edit" variant="outline" />
                <AppButton
                  onPress={() => router.push({ pathname: '/employer-applications', params: { jobId: job.id } })}
                  size="sm"
                  title="Applicants"
                  variant="secondary"
                />
                {job.status === 'draft' ? (
                  <AppButton onPress={() => handleTransition(job, 'publish', 'Published')} size="sm" title="Publish" />
                ) : null}
                {job.status === 'published' ? (
                  <>
                    <AppButton onPress={() => handleTransition(job, 'pause', 'Paused')} size="sm" title="Pause" variant="outline" />
                    <AppButton onPress={() => handleTransition(job, 'close', 'Closed')} size="sm" title="Close" variant="ghost" />
                  </>
                ) : null}
                {job.status === 'paused' ? (
                  <AppButton onPress={() => handleTransition(job, 'resume', 'Republished')} size="sm" title="Resume" />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <AppModal onClose={() => setEditorOpen(false)} title={form.id ? 'Edit Job Post' : 'Post a Job'} visible={editorOpen}>
        <ScrollView contentContainerStyle={styles.modalStack} showsVerticalScrollIndicator={false}>
          {editorError ? <InlineAlert message={editorError} variant="error" /> : null}
          <AppText variant="label" color={colors.text}>Category *</AppText>
          <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
            {jobCategories.map((cat) => {
              const selected = form.categoryId === cat.id;
              return (
                <AppPressable
                  key={cat.id}
                  onPress={() => setForm((p) => ({ ...p, categoryId: cat.id, subcategoryId: '' }))}
                  style={[styles.pill, selected && styles.pillActive]}
                >
                  <AppText variant="caption" color={selected ? colors.inverse : colors.textSecondary}>{cat.name}</AppText>
                </AppPressable>
              );
            })}
          </ScrollView>
          {selectedCategory?.children?.length ? (
            <>
              <AppText variant="label" color={colors.text}>Subcategory</AppText>
              <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
                <AppPressable
                  onPress={() => setForm((p) => ({ ...p, subcategoryId: '' }))}
                  style={[styles.pill, !form.subcategoryId && styles.pillActive]}
                >
                  <AppText variant="caption" color={!form.subcategoryId ? colors.inverse : colors.textSecondary}>
                    Any subcategory
                  </AppText>
                </AppPressable>
                {selectedCategory.children.map((subcategory) => (
                  <AppPressable
                    key={subcategory.id}
                    onPress={() => setForm((p) => ({ ...p, subcategoryId: subcategory.id }))}
                    style={[styles.pill, form.subcategoryId === subcategory.id && styles.pillActive]}
                  >
                    <AppText
                      variant="caption"
                      color={form.subcategoryId === subcategory.id ? colors.inverse : colors.textSecondary}
                    >
                      {subcategory.name}
                    </AppText>
                  </AppPressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <AppInput label="Job Title *" onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} value={form.title} />
          <AppInput label="Description *" multiline onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} value={form.description} />
          <AppInput label="Key Responsibilities" multiline onChangeText={(v) => setForm((p) => ({ ...p, responsibilities: v }))} value={form.responsibilities} />

          <AppText variant="label" color={colors.text}>Employment Type</AppText>
          <View style={styles.wrapRow}>
            {EMPLOYMENT_TYPES.map((t) => (
              <AppPressable
                key={t.key}
                onPress={() => setForm((p) => ({ ...p, employmentType: t.key }))}
                style={[styles.pill, form.employmentType === t.key && styles.pillActive]}
              >
                <AppText variant="caption" color={form.employmentType === t.key ? colors.inverse : colors.textSecondary}>{t.label}</AppText>
              </AppPressable>
            ))}
          </View>

          <AppText variant="label" color={colors.text}>Work Mode</AppText>
          <View style={styles.wrapRow}>
            {WORK_MODES.map((m) => (
              <AppPressable
                key={m.key}
                onPress={() => setForm((p) => ({ ...p, workMode: m.key }))}
                style={[styles.pill, form.workMode === m.key && styles.pillActive]}
              >
                <AppText variant="caption" color={form.workMode === m.key ? colors.inverse : colors.textSecondary}>{m.label}</AppText>
              </AppPressable>
            ))}
          </View>

          <AppInput label="Location" onChangeText={(v) => setForm((p) => ({ ...p, location: v }))} placeholder="City, State or Remote" value={form.location} />
          <View style={styles.rowBtns}>
            <AppInput containerStyle={styles.flexBtn} keyboardType="number-pad" label="Min Exp (yrs)" onChangeText={(v) => setForm((p) => ({ ...p, experienceMin: v }))} value={form.experienceMin} />
            <AppInput containerStyle={styles.flexBtn} keyboardType="number-pad" label="Max Exp (yrs)" onChangeText={(v) => setForm((p) => ({ ...p, experienceMax: v }))} value={form.experienceMax} />
          </View>
          <AppInput label="Qualification / Education" onChangeText={(v) => setForm((p) => ({ ...p, educationRequired: v }))} value={form.educationRequired} />

          <View style={styles.switchRow}>
            <AppText variant="label" color={colors.text}>Keep Salary Undisclosed</AppText>
            <Switch onValueChange={(v) => setForm((p) => ({ ...p, salaryUndisclosed: v }))} value={form.salaryUndisclosed} />
          </View>
          {!form.salaryUndisclosed ? (
            <View style={styles.rowBtns}>
              <AppInput containerStyle={styles.flexBtn} keyboardType="number-pad" label="Min Salary" onChangeText={(v) => setForm((p) => ({ ...p, salaryMin: v }))} value={form.salaryMin} />
              <AppInput containerStyle={styles.flexBtn} keyboardType="number-pad" label="Max Salary" onChangeText={(v) => setForm((p) => ({ ...p, salaryMax: v }))} value={form.salaryMax} />
            </View>
          ) : null}
          <AppText variant="label" color={colors.text}>Salary Currency</AppText>
          <View style={styles.wrapRow}>
            {['INR', 'USD', 'EUR', 'GBP'].map((currency) => (
              <AppPressable
                key={currency}
                onPress={() => setForm((p) => ({ ...p, currency }))}
                style={[styles.pill, form.currency === currency && styles.pillActive]}
              >
                <AppText variant="caption" color={form.currency === currency ? colors.inverse : colors.textSecondary}>
                  {currency}
                </AppText>
              </AppPressable>
            ))}
          </View>

          <View style={styles.rowBtns}>
            <AppInput containerStyle={styles.flexBtn} keyboardType="number-pad" label="Openings" onChangeText={(v) => setForm((p) => ({ ...p, openings: v }))} value={form.openings} />
            <AppInput containerStyle={styles.flexBtn} label="Deadline (YYYY-MM-DD)" onChangeText={(v) => setForm((p) => ({ ...p, deadline: v }))} placeholder="2026-12-31" value={form.deadline} />
          </View>
          <AppInput label="Required Skills (comma separated)" onChangeText={(v) => setForm((p) => ({ ...p, skills: v }))} value={form.skills} />
          <AppText variant="label" color={colors.text}>Application Method</AppText>
          <View style={styles.wrapRow}>
            {APPLICATION_METHODS.map((method) => (
              <AppPressable
                key={method.key}
                onPress={() => setForm((p) => ({ ...p, applicationMethod: method.key }))}
                style={[styles.pill, form.applicationMethod === method.key && styles.pillActive]}
              >
                <AppText
                  variant="caption"
                  color={form.applicationMethod === method.key ? colors.inverse : colors.textSecondary}
                >
                  {method.label}
                </AppText>
              </AppPressable>
            ))}
          </View>
          {form.applicationMethod !== 'in_app' ? (
            <AppInput
              autoCapitalize="none"
              keyboardType={form.applicationMethod === 'email' ? 'email-address' : 'url'}
              label={form.applicationMethod === 'email' ? 'Application Email *' : 'Application URL *'}
              onChangeText={(v) => setForm((p) => ({ ...p, applicationTarget: v }))}
              value={form.applicationTarget}
            />
          ) : null}
          <AppInput
            label="Application Questions (one per line, optional)"
            multiline
            onChangeText={(v) => setForm((p) => ({ ...p, applicationQuestions: v }))}
            value={form.applicationQuestions}
          />

          <View style={styles.rowBtns}>
            <AppButton containerStyle={styles.flexBtn} disabled={editorSaving} onPress={() => handleSave('save_draft')} title="Save Draft" variant="outline" />
            <AppButton containerStyle={styles.flexBtn} loading={editorSaving} onPress={() => handleSave('publish')} title="Publish Job" />
          </View>
        </ScrollView>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topControls: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  rail: { gap: spacing.xs, paddingVertical: 2 },
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
  rowBtns: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  list: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: 4,
  },
  modalStack: { gap: spacing.sm, paddingBottom: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
});

