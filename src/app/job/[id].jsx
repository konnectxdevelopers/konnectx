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
  applyToJobRequest,
  getPublicJobDetailRequest,
} from '../../services/marketplace/marketplaceService';
import { uploadResumeAttachmentRequest } from '../../services/profiles/roleProfileService';
import { colors, radii, spacing } from '../../theme/tokens';

function formatSalary(job) {
  if (!job || job.salaryUndisclosed) return 'Salary undisclosed';
  const cur = job.currency === 'INR' ? '₹' : `${job.currency || 'INR'} `;
  if (job.salaryMin && job.salaryMax) return `${cur}${Number(job.salaryMin).toLocaleString('en-IN')} - ${cur}${Number(job.salaryMax).toLocaleString('en-IN')}`;
  if (job.salaryMin) return `From ${cur}${Number(job.salaryMin).toLocaleString('en-IN')}`;
  if (job.salaryMax) return `Up to ${cur}${Number(job.salaryMax).toLocaleString('en-IN')}`;
  return 'Salary undisclosed';
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [myApplication, setMyApplication] = useState(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [coverNote, setCoverNote] = useState('');
  const [answers, setAnswers] = useState({});
  const [resumeAsset, setResumeAsset] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyError, setApplyError] = useState(null);

  const loadJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPublicJobDetailRequest(session, String(id));
      setJob(res.job);
      setMyApplication(res.myApplication || null);
    } catch (err) {
      setError(err?.message || 'Could not load job details.');
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    getPublicJobDetailRequest(session, String(id))
      .then((res) => {
        if (!active) return;
        setJob(res.job);
        setMyApplication(res.myApplication || null);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load job details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, session]);

  const handlePickResume = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });
      if (doc.canceled || !doc.assets?.[0]) return;
      setUploading(true);
      setApplyError(null);
      const uploaded = await uploadResumeAttachmentRequest(session, session?.user?.selectedRole || 'customer', doc.assets[0]);
      setResumeAsset({ id: uploaded.id, name: doc.assets[0].name || 'Resume.pdf' });
    } catch (err) {
      setApplyError(err?.message || 'Could not upload resume.');
    } finally {
      setUploading(false);
    }
  };

  const handleApply = async () => {
    if (!session?.token) {
      showToast('Sign in to submit a job application.', 'info');
      return;
    }
    setSubmitting(true);
    setApplyError(null);
    try {
      const res = await applyToJobRequest(session, job.id, {
        coverNote: coverNote.trim() || null,
        answers,
        ...(resumeAsset ? { resumeMediaId: resumeAsset.id } : {}),
      });
      setMyApplication(res.application);
      setApplyOpen(false);
      showToast('Application submitted.', 'success');
    } catch (err) {
      setApplyError(err?.message || 'Could not submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExternalApply = async () => {
    if (!job?.applicationTarget) return;
    const url = job.applicationMethod === 'email'
      ? `mailto:${job.applicationTarget}?subject=${encodeURIComponent(`Application: ${job.title}`)}`
      : job.applicationTarget;
    try {
      await Linking.openURL(url);
    } catch (err) {
      showToast(err?.message || 'Could not open the external application destination.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        onBack={() => router.back()}
        showBack
        subtitle={job?.employerName || 'Job Opportunity'}
        title={job?.title || 'Job Details'}
      />

      {loading ? (
        <LoadingState message="Loading job details..." />
      ) : error || !job ? (
        <ErrorState message={error || 'Job was not found.'} onRetry={loadJob} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <Badge label={job.employmentType} variant="neutral" />
              <Badge label={job.workMode} variant="info" />
              {job.categoryName ? <Badge label={job.categoryName} variant="neutral" /> : null}
            </View>
            <AppText variant="h2" color={colors.text}>{job.title}</AppText>
            <AppText variant="label" color={colors.primary}>{job.employerName || 'Employer'}</AppText>
            <AppText variant="caption" color={colors.muted}>
              {[
                job.location,
                job.experienceRequired || (
                  job.experienceMin !== null && job.experienceMin !== undefined
                    ? `${job.experienceMin}${job.experienceMax !== null && job.experienceMax !== undefined ? `-${job.experienceMax}` : '+'} years experience`
                    : null
                ),
                `${job.openings || 1} opening(s)`,
                job.createdAt ? `Posted ${new Date(job.createdAt).toLocaleDateString()}` : null,
                job.deadline ? `Apply by ${String(job.deadline).slice(0, 10)}` : null,
              ].filter(Boolean).join(' · ')}
            </AppText>
            <AppText variant="h4" color={colors.text}>{formatSalary(job)}</AppText>
          </View>

          <View style={styles.card}>
            <AppText variant="h4" color={colors.text}>Role Overview</AppText>
            <AppText variant="body" color={colors.textSecondary}>{job.description}</AppText>
            {job.responsibilities ? (
              <>
                <AppText variant="label" color={colors.text}>Responsibilities</AppText>
                <AppText variant="body" color={colors.textSecondary}>{job.responsibilities}</AppText>
              </>
            ) : null}
            {job.educationRequired ? (
              <AppText variant="caption" color={colors.textSecondary}>Qualification: {job.educationRequired}</AppText>
            ) : null}
            {job.subcategoryName ? (
              <AppText variant="caption" color={colors.textSecondary}>Specialty: {job.subcategoryName}</AppText>
            ) : null}
            {job.skills?.length > 0 ? (
              <View style={styles.badgeRow}>
                {job.skills.map((s) => <Badge key={s} label={s} variant="neutral" />)}
              </View>
            ) : null}
          </View>

          {myApplication ? (
            <InlineAlert
              message={`You applied to this job. Current status: ${myApplication.status}.`}
              variant="success"
            />
          ) : job.isExpired || job.status !== 'published' ? (
            <InlineAlert message="This job is closed or past its application deadline." variant="warning" />
          ) : job.applicationMethod === 'in_app' ? (
            <AppButton
              icon="send-outline"
              onPress={() => {
                if (!session?.token) {
                  showToast('Sign in to apply for this job.', 'info');
                  return;
                }
                setApplyOpen(true);
              }}
              title="Apply Now"
            />
          ) : (
            <AppButton
              icon={job.applicationMethod === 'email' ? 'email-outline' : 'open-in-new'}
              onPress={handleExternalApply}
              title={job.applicationMethod === 'email' ? 'Email Employer' : 'Apply on Employer Site'}
              variant="secondary"
            />
          )}
        </ScrollView>
      )}

      <AppModal onClose={() => setApplyOpen(false)} title="Submit Application" visible={applyOpen}>
        <View style={styles.modalStack}>
          {applyError ? <InlineAlert message={applyError} variant="error" /> : null}
          <AppInput
            label="Cover Note"
            multiline
            onChangeText={setCoverNote}
            placeholder="Share relevant experience and why you are a strong fit..."
            value={coverNote}
          />
          {(job.applicationQuestions || []).map((question, index) => (
            <AppInput
              key={`application-question-${index}`}
              label={question}
              multiline
              onChangeText={(value) => setAnswers((current) => ({ ...current, [String(index)]: value }))}
              value={answers[String(index)] || ''}
            />
          ))}
          <AppButton
            disabled={uploading}
            icon="file-upload-outline"
            onPress={handlePickResume}
            title={uploading ? 'Uploading...' : resumeAsset ? `Attached: ${resumeAsset.name}` : 'Attach Resume (PDF/Image)'}
            variant="secondary"
          />
          <AppButton loading={submitting} onPress={handleApply} title="Submit Application" />
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignSelf: 'center', width: '100%', maxWidth: 600, padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalStack: { gap: spacing.sm },
});

