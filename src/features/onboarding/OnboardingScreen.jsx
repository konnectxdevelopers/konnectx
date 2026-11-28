import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppIcon, AppText } from '../../components/ui';
import { useLocale } from '../../i18n/LocaleProvider';
import useResponsive from '../../theme/useResponsive';
import { colors, radii, shadows, spacing } from '../../theme/tokens';

const slides = [
  { id: 'business', illustration: BusinessIllustration },
  { id: 'professionals', illustration: PeopleIllustration },
  { id: 'work', illustration: WorkIllustration },
];

const businessBars = ['38%', '58%', '46%', '70%', '62%', '94%'];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const responsive = useResponsive();
  const { t } = useLocale();
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const pageWidth = width - responsive.horizontalPadding * 2;
  const artHeight = Math.min(Math.max(height * 0.27, 168), 232);

  const continueOnboarding = () => {
    if (activeIndex === slides.length - 1) {
      router.replace('/welcome');
      return;
    }

    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    listRef.current?.scrollToOffset({ offset: pageWidth * nextIndex, animated: true });
  };

  const updateIndex = (event) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.min(Math.max(nextIndex, 0), slides.length - 1));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View
        style={[
          styles.shell,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <Image
                accessibilityLabel="KonnectX logo"
                resizeMode="contain"
                source={require('../../../assets/logo.png')}
                style={styles.brandLogo}
              />
            </View>
            <AppText variant="subtitle" color={colors.primary} style={styles.brand}>
              KonnectX
            </AppText>
          </View>
          <View style={styles.stepPill}>
            <AppText variant="caption" color={colors.primary} style={styles.stepText}>
              {`0${activeIndex + 1} / 0${slides.length}`}
            </AppText>
          </View>
        </View>

        <View style={styles.progressTrack}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.progressSegment,
                index <= activeIndex && styles.progressSegmentActive,
              ]}
            />
          ))}
        </View>

        <FlatList
          ref={listRef}
          alwaysBounceVertical={false}
          bounces={false}
          data={slides}
          horizontal
          keyExtractor={(slide) => slide.id}
          onMomentumScrollEnd={updateIndex}
          pagingEnabled
          renderItem={({ item }) => (
            <OnboardingPage
              artHeight={artHeight}
              slide={item}
              t={t}
              width={pageWidth}
            />
          )}
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
        />

        <View style={styles.footer}>
          <View style={styles.dots}>
            {slides.map((slide, index) => (
              <View
                key={slide.id}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
          <AppButton
            fullWidth
            iconRight="arrow-right"
            onPress={continueOnboarding}
            size="lg"
            title={t('common.continue')}
            variant="cta"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function OnboardingPage({ width, artHeight, slide, t }) {
  const Illustration = slide.illustration;
  const copy = t(`onboarding.slides.${slide.id}`);

  return (
    <View style={[styles.page, { width }]}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.pageContent}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={styles.pageScroll}
      >
        <Illustration height={artHeight} t={t} />

        <View style={styles.copy}>
          <AppText variant="overline" color={colors.cta}>
            {copy.eyebrow}
          </AppText>
          <AppText variant="h2" style={styles.title}>
            {copy.title}
          </AppText>
          <AppText variant="body" color={colors.muted} style={styles.subtitle}>
            {copy.subtitle}
          </AppText>

          <View style={styles.pointGrid}>
            {copy.points.map((point) => (
              <View key={point} style={styles.point}>
                <View style={styles.pointCheck}>
                  <AppIcon name="check" size={11} color={colors.primary} />
                </View>
                <AppText variant="caption" color={colors.textSecondary} style={styles.pointText}>
                  {point}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function BusinessIllustration({ height, t }) {
  const copy = t('onboarding.illustrations');

  return (
    <View style={[styles.stage, styles.stageMint, { height }]}>
      <View style={styles.stageOrbMint} />
      <View style={styles.businessCard}>
        <View style={styles.businessHeader}>
          <View style={styles.businessIcon}>
            <AppIcon name="briefcase-outline" size={17} color={colors.primary} />
          </View>
          <View style={styles.businessHeading}>
            <View style={styles.businessTitleLine} />
            <View style={styles.businessSubtitleLine} />
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <AppText variant="overline" color={colors.primary} style={styles.liveText}>
              {copy.live}
            </AppText>
          </View>
        </View>

        <View style={styles.businessStats}>
          <View>
            <AppText variant="overline" color={colors.muted} style={styles.statLabel}>
              {copy.profileVisits}
            </AppText>
            <AppText variant="title" color={colors.primary} style={styles.statValue}>
              +28%
            </AppText>
          </View>
          <View style={styles.trend}>
            <AppIcon name="trending-up" size={18} color={colors.success} />
            <AppText variant="caption" color={colors.success}>
              {copy.thisMonth}
            </AppText>
          </View>
        </View>

        <View style={styles.chart}>
          {businessBars.map((barHeight, index) => (
            <View
              key={index}
              style={[
                styles.chartBar,
                { height: barHeight },
                index === businessBars.length - 1 && styles.chartBarActive,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function PeopleIllustration({ height, t }) {
  return (
    <View style={[styles.stage, styles.stageBlue, { height }]}>
      <View style={styles.peopleRing} />
      <View style={styles.peopleLineHorizontal} />
      <View style={styles.peopleLineVertical} />

      <View style={[styles.peopleNode, styles.peopleNodeTop]}>
        <AppIcon name="tools" size={20} color={colors.primary} />
      </View>
      <View style={[styles.peopleNode, styles.peopleNodeLeft]}>
        <AppIcon name="palette-outline" size={20} color={colors.cta} />
      </View>
      <View style={[styles.peopleNode, styles.peopleNodeRight]}>
        <AppIcon name="account-multiple-outline" size={20} color={colors.info} />
      </View>
      <View style={[styles.peopleNode, styles.peopleNodeBottom]}>
        <AppIcon name="home-outline" size={20} color={colors.success} />
      </View>

      <View style={styles.peopleCenter}>
        <AppIcon name="account-group" size={30} color={colors.primary} />
      </View>

      <View style={styles.peopleLabel}>
        <AppText variant="overline" color={colors.text} style={styles.peopleLabelText}>
          {t('onboarding.illustrations.networkGrowing')}
        </AppText>
      </View>
    </View>
  );
}

function WorkIllustration({ height, t }) {
  const copy = t('onboarding.illustrations');
  const tasks = copy.tasks.map((title, index) => ({ title, complete: index < 2 }));

  return (
    <View style={[styles.stage, styles.stageWarm, { height }]}>
      <View style={styles.taskBoard}>
        <View style={styles.taskHeader}>
          <View style={styles.taskIcon}>
            <AppIcon name="layers-outline" size={17} color={colors.primary} />
          </View>
          <View style={styles.taskHeading}>
            <AppText variant="overline" color={colors.muted} style={styles.taskEyebrow}>
              {copy.projectBoard}
            </AppText>
            <AppText variant="headline" color={colors.text} numberOfLines={1}>
              {copy.projectName}
            </AppText>
          </View>
          <AppIcon name="dots-horizontal" size={20} color={colors.subtle} />
        </View>

        <View style={styles.taskProgressRow}>
          <AppText variant="caption" color={colors.muted}>
            {copy.projectProgress}
          </AppText>
          <AppText variant="caption" color={colors.primary} style={styles.progressValue}>
            68%
          </AppText>
        </View>
        <View style={styles.taskProgressTrack}>
          <View style={styles.progressFill} />
        </View>

        <View style={styles.taskRows}>
          {tasks.map((task) => (
            <View key={task.title} style={styles.taskRow}>
              <View style={[styles.taskCheck, task.complete && styles.taskCheckDone]}>
                {task.complete ? (
                  <AppIcon name="check" size={11} color={colors.inverse} />
                ) : null}
              </View>
              <AppText variant="caption" color={colors.textSecondary} style={styles.taskName}>
                {task.title}
              </AppText>
              <View style={[styles.taskStatus, task.complete && styles.taskStatusDone]} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.workStatus}>
        <View style={styles.workStatusIcon}>
          <AppIcon name="check" size={13} color={colors.success} />
        </View>
        <View>
          <AppText variant="overline" color={colors.success}>
            {copy.onTrack}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {copy.allInOneView}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  shell: {
    flex: 1,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: spacing.md,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandMark: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  brandLogo: {
    width: 26,
    height: 26,
  },
  brand: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  stepPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  stepText: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  progressSegmentActive: {
    backgroundColor: colors.primary,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  stage: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.xxl,
    borderWidth: 1,
  },
  stageMint: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
  },
  stageBlue: {
    borderColor: '#DCE7FA',
    backgroundColor: '#EEF4FE',
  },
  stageWarm: {
    borderColor: '#F6DFD0',
    backgroundColor: '#FFF3EB',
  },
  stageOrbMint: {
    position: 'absolute',
    top: -90,
    left: -60,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#DCEAE4',
  },
  copy: {
    marginTop: spacing.lg,
  },
  title: {
    marginTop: spacing.xs,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  pointGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  point: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pointCheck: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.primaryMuted,
  },
  pointText: {
    flex: 1,
    fontWeight: '500',
    lineHeight: 16,
  },
  businessCard: {
    width: '84%',
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  businessIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  businessHeading: {
    flex: 1,
    gap: 5,
  },
  businessTitleLine: {
    width: '76%',
    height: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  businessSubtitleLine: {
    width: '52%',
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryMuted,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 8,
    letterSpacing: 0.6,
  },
  businessStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  statLabel: {
    fontSize: 8,
    letterSpacing: 0.9,
  },
  statValue: {
    marginTop: 1,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chart: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  chartBar: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: colors.primaryMuted,
  },
  chartBarActive: {
    backgroundColor: colors.cta,
  },
  peopleRing: {
    position: 'absolute',
    width: 158,
    height: 158,
    borderWidth: 1,
    borderColor: '#CBD9F2',
    borderRadius: 80,
  },
  peopleLineHorizontal: {
    position: 'absolute',
    left: '16%',
    width: '68%',
    height: 1.5,
    backgroundColor: '#CBD9F2',
  },
  peopleLineVertical: {
    position: 'absolute',
    top: '15%',
    height: '70%',
    width: 1.5,
    backgroundColor: '#CBD9F2',
  },
  peopleNode: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  peopleNodeTop: {
    top: 12,
  },
  peopleNodeLeft: {
    left: 18,
  },
  peopleNodeRight: {
    right: 18,
  },
  peopleNodeBottom: {
    bottom: 12,
  },
  peopleCenter: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.surface,
    borderRadius: 38,
    backgroundColor: colors.primaryMuted,
    ...shadows.card,
  },
  peopleLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.cta,
  },
  peopleLabelText: {
    color: colors.inverse,
    fontSize: 8,
    letterSpacing: 0.6,
  },
  taskBoard: {
    width: '86%',
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  taskHeading: {
    flex: 1,
    gap: 1,
  },
  taskEyebrow: {
    fontSize: 8,
    letterSpacing: 0.9,
  },
  taskProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  progressValue: {
    fontWeight: '700',
  },
  taskProgressTrack: {
    height: 6,
    overflow: 'hidden',
    marginTop: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  progressFill: {
    width: '68%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.cta,
  },
  taskRows: {
    marginTop: spacing.xs,
  },
  taskRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  taskCheck: {
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 5,
  },
  taskCheckDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  taskName: {
    flex: 1,
  },
  taskStatus: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  taskStatusDone: {
    backgroundColor: colors.success,
  },
  workStatus: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  workStatusIcon: {
    width: 19,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
  },
  footer: {
    paddingTop: spacing.md,
  },
  dots: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 26,
    backgroundColor: colors.primary,
  },
});
