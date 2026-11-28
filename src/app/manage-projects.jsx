import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
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
  createProjectRequest,
  getMyProjectAttachmentUrlRequest,
  getMarketplaceCategoryTreeRequest,
  getMyProjectDetailRequest,
  getMyProjectsRequest,
  transitionProjectStatusRequest,
  updateProjectRequest,
} from '../services/marketplace/marketplaceService';
import { uploadProjectAttachmentRequest } from '../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../theme/tokens';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Open' },
  { key: 'draft', label: 'Drafts' },
  { key: 'pending_review', label: 'Pending review' },
  { key: 'awarded', label: 'Awarded' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'archived', label: 'Archived' },
];

const BUDGET_TYPES = [
  { key: 'fixed', label: 'Fixed' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'range', label: 'Range' },
  { key: 'negotiable', label: 'Negotiable' },
];

const WORK_MODES = [
  { key: 'remote', label: 'Remote' },
  { key: 'on-site', label: 'On-site' },
  { key: 'hybrid', label: 'Hybrid' },
];

const EMPTY_FORM = {
  id: null,
  title: '',
  categoryId: '',
  subcategoryId: '',
  description: '',
  deliverables: '',
  budgetType: 'fixed',
  budget: '',
  budgetMin: '',
  budgetMax: '',
  currency: 'INR',
  workMode: 'remote',
  location: '',
  experienceLevel: '',
  deadline: '',
  proposalDeadline: '',
  requiredSkills: '',
  screeningQuestions: '',
  visibility: 'public',
};

function statusVariant(status) {
  if (status === 'published' || status === 'completed') return 'success';
  if (status === 'awarded') return 'info';
  if (status === 'pending_review') return 'warning';
  if (status === 'cancelled' || status === 'rejected') return 'danger';
  return 'neutral';
}

export default function ManageProjectsScreen() {
  const { role: paramRole } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [categoryTree, setCategoryTree] = useState([]);
  const [projectAttachments, setProjectAttachments] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const projectCategories = useMemo(() => {
    const root = categoryTree.find((n) => n.listingType === 'project' || n.slug === 'freelance-projects');
    if (root?.children?.length) return root.children;
    return categoryTree.filter((n) => n.listingType === 'project');
  }, [categoryTree]);
  const selectedProjectCategory = projectCategories.find((category) => category.id === form.categoryId);

  const loadProjects = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyProjectsRequest(session, {
        role: paramRole ? String(paramRole) : undefined,
        status: activeTab === 'all' ? undefined : activeTab,
        q: searchText.trim() || undefined,
      });
      setProjects(res.items || []);
      setCounts(res.countsByStatus || {});
    } catch (err) {
      setError(err?.message || 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, paramRole, searchText, session]);

  useEffect(() => {
    let active = true;
    getMarketplaceCategoryTreeRequest('project')
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
    getMyProjectsRequest(session, {
      role: paramRole ? String(paramRole) : undefined,
      status: activeTab === 'all' ? undefined : activeTab,
      q: searchText.trim() || undefined,
    })
      .then((res) => {
        if (!active) return;
        setProjects(res.items || []);
        setCounts(res.countsByStatus || {});
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load projects.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, paramRole, searchText, session]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, categoryId: projectCategories[0]?.id || '' });
    setProjectAttachments([]);
    setExistingAttachments([]);
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = async (item) => {
    setEditorError(null);
    try {
      const res = await getMyProjectDetailRequest(session, item.id);
      const p = res.project || item;
      setForm({
        id: p.id,
        title: p.title || '',
        categoryId: p.categoryId || '',
        subcategoryId: p.subcategoryId || '',
        description: p.description || '',
        deliverables: p.deliverables || '',
        budgetType: p.budgetType || 'fixed',
        budget: p.budget !== null && p.budget !== undefined ? String(p.budget) : '',
        budgetMin: p.budgetMin !== null && p.budgetMin !== undefined ? String(p.budgetMin) : '',
        budgetMax: p.budgetMax !== null && p.budgetMax !== undefined ? String(p.budgetMax) : '',
        currency: p.currency || 'INR',
        workMode: p.workMode || 'remote',
        location: p.location || '',
        experienceLevel: p.experienceLevel || '',
        deadline: p.deadline ? String(p.deadline).slice(0, 10) : '',
        proposalDeadline: p.proposalDeadline ? String(p.proposalDeadline).slice(0, 10) : '',
        requiredSkills: Array.isArray(p.requiredSkills) ? p.requiredSkills.join(', ') : '',
        screeningQuestions: Array.isArray(p.screeningQuestions) ? p.screeningQuestions.join('\n') : '',
        visibility: p.visibility || 'public',
      });
      setProjectAttachments([]);
      setExistingAttachments(p.attachments || []);
      setEditorOpen(true);
    } catch (err) {
      showToast(err?.message || 'Could not load project details.', 'error');
    }
  };

  const handlePickAttachments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const next = [...projectAttachments, ...result.assets];
      if (next.length + existingAttachments.length > 10) {
        setEditorError('Attach at most 10 files.');
        return;
      }
      setProjectAttachments(next);
      setEditorError(null);
    } catch (err) {
      setEditorError(err?.message || 'Could not choose project attachments.');
    }
  };

  const handleOpenAttachment = async (attachment) => {
    try {
      const result = await getMyProjectAttachmentUrlRequest(session, form.id, attachment.id);
      if (result.url) await Linking.openURL(result.url);
    } catch (err) {
      showToast(err?.message || 'Could not open project attachment.', 'error');
    }
  };

  const handleSave = async (action) => {
    if (!form.title.trim()) {
      setEditorError('Project title is required.');
      return;
    }
    if (action !== 'save_draft' && (!form.categoryId || !form.description.trim())) {
      setEditorError('Category and project scope are required before publishing.');
      return;
    }
    if (form.budgetType === 'range' && form.budgetMin && form.budgetMax &&
        Number(form.budgetMax) < Number(form.budgetMin)) {
      setEditorError('Maximum budget must be greater than or equal to minimum budget.');
      return;
    }
    if (form.proposalDeadline && form.deadline && form.proposalDeadline > form.deadline) {
      setEditorError('Proposal deadline cannot be after the project deadline.');
      return;
    }
    setEditorSaving(true);
    setEditorError(null);
    try {
      const ownerRole = paramRole ? String(paramRole) : session?.user?.selectedRole || 'hiring';
      const uploadedAttachments = await Promise.all(
        projectAttachments.map((file) => uploadProjectAttachmentRequest(session, file, ownerRole))
      );
      const payload = {
        action,
        clientRole: ownerRole,
        title: form.title.trim(),
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        description: form.description.trim(),
        deliverables: form.deliverables.trim() || null,
        budgetType: form.budgetType,
        budget: form.budget.trim() ? Number(form.budget) : null,
        budgetMin: form.budgetMin.trim() ? Number(form.budgetMin) : null,
        budgetMax: form.budgetMax.trim() ? Number(form.budgetMax) : null,
        currency: form.currency || 'INR',
        workMode: form.workMode,
        location: form.location.trim() || null,
        experienceLevel: form.experienceLevel.trim() || null,
        deadline: form.deadline.trim() || null,
        proposalDeadline: form.proposalDeadline.trim() || null,
        requiredSkills: form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        screeningQuestions: form.screeningQuestions.split(/\r?\n/).map((question) => question.trim()).filter(Boolean),
        visibility: form.visibility,
        attachmentAssetIds: [
          ...existingAttachments.map((attachment) => attachment.mediaAssetId).filter(Boolean),
          ...uploadedAttachments.map((attachment) => attachment.id),
        ],
      };
      if (form.id) {
        await updateProjectRequest(session, form.id, payload);
      } else {
        await createProjectRequest(session, payload);
      }
      setEditorOpen(false);
      setProjectAttachments([]);
      setExistingAttachments([]);
      showToast(action === 'save_draft' ? 'Project draft saved.' : 'Project published.', 'success');
      await loadProjects();
    } catch (err) {
      setEditorError(err?.message || 'Could not save project.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleTransition = (proj, action, label) => {
    const run = async () => {
      try {
        await transitionProjectStatusRequest(session, proj.id, action);
        showToast(`Project ${label.toLowerCase()}.`, 'success');
        await loadProjects();
      } catch (err) {
        showToast(err?.message || `Could not ${label.toLowerCase()} project.`, 'error');
      }
    };
    if (['cancel', 'archive'].includes(action)) {
      Alert.alert(`${label} project`, `${label} "${proj.title}"?`, [
        { text: 'No', style: 'cancel' },
        { text: label, style: 'destructive', onPress: run },
      ]);
      return;
    }
    run();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle="Scope, budget & proposals"
        title="Freelance Projects"
        rightAction={{
          icon: 'file-document-multiple-outline',
          onPress: () => router.push('/project-proposals'),
        }}
      />

      <View style={styles.topControls}>
        <SearchBar
          onChangeText={setSearchText}
          onSubmit={loadProjects}
          placeholder="Search projects..."
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
          <AppButton containerStyle={styles.flexBtn} icon="plus" onPress={openCreate} size="sm" title="Post Project" />
          <AppButton
            containerStyle={styles.flexBtn}
            icon="inbox-outline"
            onPress={() => router.push('/project-proposals')}
            size="sm"
            title="Proposals"
            variant="secondary"
          />
        </View>
      </View>

      {loading ? (
        <LoadingState message="Loading your projects..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadProjects} />
      ) : !projects.length ? (
        <EmptyState
          actionLabel="Post a Project"
          icon="rocket-launch-outline"
          message="Post freelance project requirements and review proposals from verified talent."
          onAction={openCreate}
          title="No projects in this view"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {projects.map((proj) => (
            <View key={proj.id} style={styles.card}>
              <View style={styles.badgeRow}>
                <Badge label={proj.status.replace('_', ' ')} variant={statusVariant(proj.status)} />
                <Badge label={proj.budgetType} variant="neutral" />
                <Badge label={proj.workMode} variant="neutral" />
              </View>
              <AppText variant="h4" color={colors.text}>{proj.title}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {[proj.categoryName, `${proj.proposalCount ?? 0} proposals`, proj.deadline ? `Due ${String(proj.deadline).slice(0, 10)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              <View style={styles.actions}>
                <AppButton onPress={() => openEdit(proj)} size="sm" title="Edit" variant="outline" />
                <AppButton
                  onPress={() => router.push({ pathname: '/project-proposals', params: { projectId: proj.id } })}
                  size="sm"
                  title="Proposals"
                  variant="secondary"
                />
                {proj.status === 'draft' ? (
                  <AppButton onPress={() => handleTransition(proj, 'publish', 'Published')} size="sm" title="Publish" />
                ) : null}
                {proj.status === 'published' ? (
                  <>
                    <AppButton onPress={() => handleTransition(proj, 'pause', 'Paused')} size="sm" title="Pause" variant="outline" />
                    <AppButton onPress={() => handleTransition(proj, 'award', 'Awarded')} size="sm" title="Award" variant="ghost" />
                    <AppButton onPress={() => handleTransition(proj, 'cancel', 'Cancelled')} size="sm" title="Cancel" variant="outline" />
                  </>
                ) : null}
                {proj.status === 'awarded' ? (
                  <AppButton onPress={() => handleTransition(proj, 'complete', 'Completed')} size="sm" title="Complete" />
                ) : null}
                {proj.status === 'paused' ? (
                  <>
                    <AppButton onPress={() => handleTransition(proj, 'resume', 'Republished')} size="sm" title="Resume" />
                    <AppButton onPress={() => handleTransition(proj, 'cancel', 'Cancelled')} size="sm" title="Cancel" variant="outline" />
                  </>
                ) : null}
                {['draft', 'pending_review', 'published', 'paused', 'awarded', 'completed', 'cancelled'].includes(proj.status) ? (
                  <AppButton onPress={() => handleTransition(proj, 'archive', 'Archived')} size="sm" title="Archive" variant="outline" />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <AppModal onClose={() => setEditorOpen(false)} title={form.id ? 'Edit Project' : 'Post Freelance Project'} visible={editorOpen}>
        <ScrollView contentContainerStyle={styles.modalStack} showsVerticalScrollIndicator={false}>
          {editorError ? <InlineAlert message={editorError} variant="error" /> : null}
          <AppText variant="label" color={colors.text}>Category *</AppText>
          <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
            {projectCategories.map((cat) => (
              <AppPressable
                key={cat.id}
                onPress={() => setForm((p) => ({ ...p, categoryId: cat.id, subcategoryId: '' }))}
                style={[styles.pill, form.categoryId === cat.id && styles.pillActive]}
              >
                <AppText variant="caption" color={form.categoryId === cat.id ? colors.inverse : colors.textSecondary}>{cat.name}</AppText>
              </AppPressable>
            ))}
          </ScrollView>
          {selectedProjectCategory?.children?.length ? (
            <>
              <AppText variant="label" color={colors.text}>Subcategory</AppText>
              <ScrollView contentContainerStyle={styles.rail} horizontal showsHorizontalScrollIndicator={false}>
                {selectedProjectCategory.children.map((cat) => (
                  <AppPressable
                    key={cat.id}
                    onPress={() => setForm((p) => ({ ...p, subcategoryId: cat.id }))}
                    style={[styles.pill, form.subcategoryId === cat.id && styles.pillActive]}
                  >
                    <AppText variant="caption" color={form.subcategoryId === cat.id ? colors.inverse : colors.textSecondary}>
                      {cat.name}
                    </AppText>
                  </AppPressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <AppInput label="Project Title *" onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} value={form.title} />
          <AppInput label="Detailed Scope *" multiline onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} value={form.description} />
          <AppInput label="Deliverables" multiline onChangeText={(v) => setForm((p) => ({ ...p, deliverables: v }))} value={form.deliverables} />

          <AppText variant="label" color={colors.text}>Budget Type</AppText>
          <View style={styles.wrapRow}>
            {BUDGET_TYPES.map((b) => (
              <AppPressable
                key={b.key}
                onPress={() => setForm((p) => ({ ...p, budgetType: b.key }))}
                style={[styles.pill, form.budgetType === b.key && styles.pillActive]}
              >
                <AppText variant="caption" color={form.budgetType === b.key ? colors.inverse : colors.textSecondary}>{b.label}</AppText>
              </AppPressable>
            ))}
          </View>

          {form.budgetType === 'range' ? (
            <View style={styles.rowBtns}>
              <AppInput containerStyle={styles.flexBtn} keyboardType="decimal-pad" label="Min Budget" onChangeText={(v) => setForm((p) => ({ ...p, budgetMin: v }))} value={form.budgetMin} />
              <AppInput containerStyle={styles.flexBtn} keyboardType="decimal-pad" label="Max Budget" onChangeText={(v) => setForm((p) => ({ ...p, budgetMax: v }))} value={form.budgetMax} />
            </View>
          ) : form.budgetType !== 'negotiable' ? (
            <AppInput keyboardType="decimal-pad" label="Budget (INR)" onChangeText={(v) => setForm((p) => ({ ...p, budget: v }))} value={form.budget} />
          ) : null}
          <AppInput
            autoCapitalize="characters"
            label="Currency code"
            maxLength={3}
            onChangeText={(v) => setForm((p) => ({ ...p, currency: v.toUpperCase() }))}
            value={form.currency}
          />

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

          <AppInput label="Location (optional)" onChangeText={(v) => setForm((p) => ({ ...p, location: v }))} value={form.location} />
          <View style={styles.rowBtns}>
            <AppInput containerStyle={styles.flexBtn} label="Project Deadline" onChangeText={(v) => setForm((p) => ({ ...p, deadline: v }))} placeholder="YYYY-MM-DD" value={form.deadline} />
            <AppInput containerStyle={styles.flexBtn} label="Proposal Deadline" onChangeText={(v) => setForm((p) => ({ ...p, proposalDeadline: v }))} placeholder="YYYY-MM-DD" value={form.proposalDeadline} />
          </View>
          <AppInput label="Required Skills (comma separated)" onChangeText={(v) => setForm((p) => ({ ...p, requiredSkills: v }))} value={form.requiredSkills} />
          <AppInput label="Experience expectations" onChangeText={(v) => setForm((p) => ({ ...p, experienceLevel: v }))} value={form.experienceLevel} />
          <AppInput
            label="Screening questions (one per line)"
            multiline
            onChangeText={(v) => setForm((p) => ({ ...p, screeningQuestions: v }))}
            value={form.screeningQuestions}
          />
          <AppText variant="label" color={colors.text}>Visibility</AppText>
          <View style={styles.wrapRow}>
            {['public', 'unlisted', 'private'].map((visibility) => (
              <AppPressable
                key={visibility}
                onPress={() => setForm((p) => ({ ...p, visibility }))}
                style={[styles.pill, form.visibility === visibility && styles.pillActive]}
              >
                <AppText variant="caption" color={form.visibility === visibility ? colors.inverse : colors.textSecondary}>
                  {visibility}
                </AppText>
              </AppPressable>
            ))}
          </View>
          <AppButton
            icon="paperclip"
            onPress={handlePickAttachments}
            title={`Add project attachments (${projectAttachments.length + existingAttachments.length}/10)`}
            variant="secondary"
          />
          {existingAttachments.map((attachment) => (
            <AppButton
              key={attachment.id}
              icon="file-document-outline"
              onPress={() => handleOpenAttachment(attachment)}
              size="sm"
              title={attachment.fileName || 'Existing attachment'}
              variant="outline"
            />
          ))}
          {projectAttachments.map((attachment, index) => (
            <AppText key={`${attachment.name}-${index}`} variant="caption" color={colors.muted}>
              {attachment.name}
            </AppText>
          ))}

          <View style={styles.rowBtns}>
            <AppButton containerStyle={styles.flexBtn} disabled={editorSaving} onPress={() => handleSave('save_draft')} title="Save Draft" variant="outline" />
            <AppButton containerStyle={styles.flexBtn} loading={editorSaving} onPress={() => handleSave('publish')} title="Publish Project" />
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
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
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
});

