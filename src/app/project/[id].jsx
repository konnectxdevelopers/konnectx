import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthProvider';
import {
  AppButton,
  AppHeader,
  AppInput,
  AppModal,
  AppText,
  Badge,
  ErrorState,
  InlineAlert,
  LoadingState,
  useToast,
} from '../../components/ui';
import {
  getPublicProjectDetailRequest,
  getPublicProjectAttachmentUrlRequest,
  submitProposalRequest,
} from '../../services/marketplace/marketplaceService';
import { uploadProposalAttachmentRequest } from '../../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../../theme/tokens';

function formatBudget(proj) {
  if (!proj) return '';
  if (proj.budgetType === 'negotiable') return 'Budget negotiable';
  const cur = proj.currency === 'INR' ? '₹' : `${proj.currency || 'INR'} `;
  if (proj.budgetType === 'range' && proj.budgetMin && proj.budgetMax) {
    return `${cur}${Number(proj.budgetMin).toLocaleString('en-IN')} - ${cur}${Number(proj.budgetMax).toLocaleString('en-IN')}`;
  }
  if (proj.budget) return `${cur}${Number(proj.budget).toLocaleString('en-IN')} (${proj.budgetType})`;
  return 'Budget negotiable';
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [myProposal, setMyProposal] = useState(null);
  const [canSubmitProposal, setCanSubmitProposal] = useState(false);

  const [propOpen, setPropOpen] = useState(false);
  const [coverMessage, setCoverMessage] = useState('');
  const [proposedAmount, setProposedAmount] = useState('');
  const [timelineText, setTimelineText] = useState('');
  const [relevantSkills, setRelevantSkills] = useState('');
  const [portfolioLinks, setPortfolioLinks] = useState('');
  const [milestonesText, setMilestonesText] = useState('');
  const [screeningAnswers, setScreeningAnswers] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [propError, setPropError] = useState(null);

  const loadProject = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPublicProjectDetailRequest(session, String(id));
      setProject(res.project);
      setMyProposal(res.myProposal || null);
      setCanSubmitProposal(Boolean(res.canSubmitProposal));
    } catch (err) {
      setError(err?.message || 'Could not load project.');
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    getPublicProjectDetailRequest(session, String(id))
      .then((res) => {
        if (!active) return;
        setProject(res.project);
        setMyProposal(res.myProposal || null);
        setCanSubmitProposal(Boolean(res.canSubmitProposal));
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load project.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, session]);

  const handlePickAttachment = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (doc.canceled || !doc.assets?.length) return;
      const availableSlots = Math.max(0, 5 - attachments.length);
      if (!availableSlots) {
        setPropError('Attach at most 5 proposal files.');
        return;
      }
      setUploading(true);
      setPropError(null);
      const selectedRole = session?.user?.capabilities?.includes('professional')
        ? 'professional'
        : session?.user?.capabilities?.includes('business') ? 'business' : 'professional';
      const selectedAssets = doc.assets.slice(0, availableSlots);
      const uploaded = await Promise.all(selectedAssets.map((asset) =>
        uploadProposalAttachmentRequest(session, selectedRole, asset)
      ));
      setAttachments((current) => [...current, ...uploaded.map((item, index) => ({
        id: item.id,
        name: selectedAssets[index]?.name || 'Proposal attachment',
      }))].slice(0, 5));
    } catch (err) {
      setPropError(err?.message || 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitProposal = async () => {
    if (!coverMessage.trim()) {
      setPropError('Cover message is required.');
      return;
    }
    if (proposedAmount.trim() && (!Number.isFinite(Number(proposedAmount)) || Number(proposedAmount) < 0)) {
      setPropError('Proposed amount must be a non-negative number.');
      return;
    }
    setSubmitting(true);
    setPropError(null);
    try {
      const res = await submitProposalRequest(session, project.id, {
        coverMessage: coverMessage.trim(),
        proposedAmount: proposedAmount.trim() ? Number(proposedAmount) : null,
        timelineText: timelineText.trim() || null,
        relevantSkills: relevantSkills.split(',').map((skill) => skill.trim()).filter(Boolean),
        portfolioLinks: portfolioLinks.split(/\r?\n/).map((link) => link.trim()).filter(Boolean),
        milestones: milestonesText.split(/\r?\n/).map((title) => title.trim()).filter(Boolean)
          .map((title) => ({ title })),
        answers: {
          screeningAnswers,
          relevantSkills: relevantSkills.split(',').map((skill) => skill.trim()).filter(Boolean),
        },
        ...(attachments.length ? { attachmentMediaIds: attachments.map((item) => item.id) } : {}),
      });
      setMyProposal(res.proposal);
      setPropOpen(false);
      showToast('Proposal submitted.', 'success');
    } catch (err) {
      setPropError(err?.message || 'Could not submit proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const openProjectAttachment = async (attachmentId) => {
    try {
      const result = await getPublicProjectAttachmentUrlRequest(session, project.id, attachmentId);
      if (result.url) await Linking.openURL(result.url);
    } catch (err) {
      showToast(err?.message || 'Could not open project attachment.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle={project?.clientName || 'Client Project'}
        title={project?.title || 'Project Details'}
      />

      {loading ? (
        <LoadingState message="Loading project details..." />
      ) : error || !project ? (
        <ErrorState message={error || 'Project was not found.'} onRetry={loadProject} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <Badge label={project.budgetType} variant="neutral" />
              <Badge label={project.workMode} variant="info" />
              {project.categoryName ? <Badge label={project.categoryName} variant="neutral" /> : null}
            </View>
            <AppText variant="h2" color={colors.text}>{project.title}</AppText>
            <AppText variant="label" color={colors.primary}>{formatBudget(project)}</AppText>
            <AppText variant="caption" color={colors.muted}>
              {[project.clientName, project.location, project.deadline ? `Deadline: ${String(project.deadline).slice(0, 10)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </View>

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Project Scope</AppText>
            <AppText variant="body" color={colors.textSecondary}>{project.description}</AppText>
            {project.deliverables ? (
              <>
                <AppText variant="label" color={colors.text}>Deliverables</AppText>
                <AppText variant="body" color={colors.textSecondary}>{project.deliverables}</AppText>
              </>
            ) : null}
            {project.requiredSkills?.length > 0 ? (
              <View style={styles.badgeRow}>
                {project.requiredSkills.map((s) => <Badge key={s} label={s} variant="neutral" />)}
              </View>
            ) : null}
            {project.attachments?.length ? (
              <View style={styles.attachments}>
                <AppText variant="label" color={colors.text}>Project attachments</AppText>
                {project.attachments.map((attachment) => (
                  <AppButton
                    key={attachment.id}
                    icon="file-document-outline"
                    onPress={() => openProjectAttachment(attachment.id)}
                    size="sm"
                    title={attachment.fileName || 'Attachment'}
                    variant="outline"
                  />
                ))}
              </View>
            ) : null}
          </View>

          <InlineAlert
            message="Contracts, escrow, milestone payments, and dispute resolution will be enabled in a future phase."
            variant="info"
          />

          {myProposal ? (
            <InlineAlert
              message={`You submitted a proposal. Current status: ${myProposal.status}.`}
              variant="success"
            />
          ) : project.isProposalExpired || project.status !== 'published' ? (
            <InlineAlert message="This project is no longer accepting proposals." variant="warning" />
          ) : !session?.token ? (
            <AppButton
              onPress={() => showToast('Sign in with an eligible professional account to submit a proposal.', 'info')}
              title="Sign in to submit a proposal"
              variant="secondary"
            />
          ) : !canSubmitProposal ? (
            <InlineAlert
              message="Proposal submission is available to professionals and explicitly enabled Business accounts."
              variant="warning"
            />
          ) : (
            <AppButton
              icon="send-outline"
              onPress={() => {
                setCoverMessage('');
                setProposedAmount('');
                setTimelineText('');
                setRelevantSkills('');
                setPortfolioLinks('');
                setMilestonesText('');
                setScreeningAnswers({});
                setAttachments([]);
                setPropError(null);
                setPropOpen(true);
              }}
              title="Submit Proposal"
            />
          )}
        </ScrollView>
      )}

      <AppModal onClose={() => setPropOpen(false)} title="Submit Proposal" visible={propOpen}>
        <View style={styles.modalStack}>
          {propError ? <InlineAlert message={propError} variant="error" /> : null}
          <AppInput label="Cover Message *" multiline onChangeText={setCoverMessage} value={coverMessage} />
          <AppInput keyboardType="decimal-pad" label="Proposed Amount (INR)" onChangeText={setProposedAmount} value={proposedAmount} />
          <AppInput label="Estimated Timeline" onChangeText={setTimelineText} placeholder="e.g. 2 weeks" value={timelineText} />
          <AppInput
            label="Relevant skills (comma separated)"
            onChangeText={setRelevantSkills}
            value={relevantSkills}
          />
          <AppInput
            label="Portfolio links (one per line)"
            multiline
            onChangeText={setPortfolioLinks}
            value={portfolioLinks}
          />
          <AppInput
            label="Proposed milestones (one per line)"
            multiline
            onChangeText={setMilestonesText}
            value={milestonesText}
          />
          {project.screeningQuestions?.map((question, index) => (
            <AppInput
              key={`${index}-${question}`}
              label={question}
              onChangeText={(value) => setScreeningAnswers((current) => ({ ...current, [question]: value }))}
              value={screeningAnswers[question] || ''}
            />
          ))}
          <AppButton
            disabled={uploading}
            icon="file-upload-outline"
            onPress={handlePickAttachment}
            title={uploading ? 'Uploading...' : `Attach Portfolio / PDF (${attachments.length}/5)`}
            variant="secondary"
          />
          {attachments.map((item) => (
            <AppText key={item.id} variant="caption" color={colors.muted}>{item.name}</AppText>
          ))}
          <AppButton loading={submitting} onPress={handleSubmitProposal} title="Submit Proposal" />
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attachments: { gap: spacing.xs },
  modalStack: { gap: spacing.sm },
});

