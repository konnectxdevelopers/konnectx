import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppPressable,
  AppTabBar,
  AppText,
  Badge,
  IconButton,
  InlineAlert,
  ProgressBar,
  Skeleton,
  SkeletonCard,
} from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { getMediaUrlRequest } from '../../services/profiles/roleProfileService';
import useResponsive from '../../theme/useResponsive';
import { colors, gradients, motion, radii, shadows, spacing } from '../../theme/tokens';

/**
 * Shared chrome for the four role dashboards. Content is constrained to a
 * comfortable reading measure on tablets/web and always clears the floating
 * tab bar.
 */
export function DashboardLayout({
  roleTitle,
  activeTab,
  onTabChange,
  tabs,
  refreshing,
  onRefresh,
  error,
  headerActions,
  children,
}) {
  const responsive = useResponsive();
  const { signOut } = useAuth();
  const [appear] = useState(() => new Animated.Value(1));

  useEffect(() => {
    appear.setValue(0);
    const animation = Animated.timing(appear, {
      toValue: 1,
      duration: motion.base,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [activeTab, appear]);

  const leaveWorkspace = async () => {
    await signOut();
    router.replace('/welcome');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingHorizontal: responsive.horizontalPadding }]}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}>
              <Image
                accessibilityLabel="KonnectX logo"
                resizeMode="contain"
                source={require('../../../assets/logo.png')}
                style={styles.brandLogo}
              />
            </View>
            <View style={styles.brandCopy}>
              <AppText style={styles.brandName} variant="subtitle">
                KonnectX
              </AppText>
              <AppText color={colors.muted} numberOfLines={1} variant="overline">
                {roleTitle}
              </AppText>
            </View>
          </View>
          <View style={styles.headerActions}>
            {headerActions}
            <IconButton
              accessibilityLabel="Sign out"
              icon="logout"
              onPress={leaveWorkspace}
              size="sm"
              variant="surface"
            />
          </View>
        </View>

        <ScrollView
          key={activeTab}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: responsive.horizontalPadding,
              paddingBottom: 128,
              maxWidth: responsive.maxContentWidth,
            },
          ]}
          refreshControl={
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={onRefresh}
              refreshing={Boolean(refreshing)}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? <InlineAlert message={error} variant="error" /> : null}
          <Animated.View
            style={{
              opacity: appear,
              transform: [
                {
                  translateY: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
            {children}
          </Animated.View>
        </ScrollView>

        <AppTabBar
          activeKey={activeTab}
          items={tabs}
          onChange={onTabChange}
          variant="brand"
        />
      </View>
    </SafeAreaView>
  );
}

export function DashboardLoadingScreen() {
  const responsive = useResponsive();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={[styles.loadingHeader, { paddingHorizontal: responsive.horizontalPadding }]}>
        <Skeleton width={132} height={38} radius={radii.md} />
        <Skeleton width={40} height={40} radius={radii.round} />
      </View>
      <View style={[styles.loadingContent, { paddingHorizontal: responsive.horizontalPadding }]}>
        <Skeleton width="100%" height={210} radius={radii.xxl} />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    </SafeAreaView>
  );
}

export function DashboardGreeting({
  name,
  subtitle,
  profileAsset,
  asset,
  location,
  onLocationPress,
  onAction,
  actionLabel,
  actionIcon = 'bell-outline',
  onAvatarPress,
}) {
  const avatar = profileAsset || asset;

  return (
    <View style={styles.greeting}>
      <DashboardProfileImage
        asset={avatar}
        icon="account-outline"
        name={name}
        onPress={onAvatarPress}
        size={54}
        style={styles.greetingAvatar}
      />
      <View style={styles.greetingCopy}>
        <AppText color={colors.muted} numberOfLines={1} variant="overline">
          {subtitle}
        </AppText>
        <AppText numberOfLines={1} variant="title">
          {name || 'Welcome'}
        </AppText>
        {location ? (
          <AppPressable
            accessibilityRole="button"
            onPress={onLocationPress}
            style={styles.locationRow}
          >
            <AppIcon color={colors.cta} name="map-marker" size={14} />
            <AppText color={colors.textSecondary} numberOfLines={1} style={styles.locationText} variant="caption">
              {location}
            </AppText>
            <AppIcon color={colors.muted} name="chevron-down" size={14} />
          </AppPressable>
        ) : null}
      </View>
      {onAction ? (
        <IconButton
          accessibilityLabel={actionLabel || 'Open profile'}
          icon={actionIcon}
          onPress={onAction}
          size="md"
          variant="surface"
        />
      ) : null}
    </View>
  );
}

export function DashboardHero({
  image,
  asset,
  eyebrow,
  title,
  description,
  profileAsset,
  profileName,
  icon = 'account-outline',
  actionLabel,
  onAction,
  verificationStatus,
  height,
  children,
}) {
  const verification = verificationLabel(verificationStatus);
  const responsive = useResponsive();
  const heroHeight = height || (responsive.isSmall ? 208 : 236);

  return (
    <View style={[styles.hero, { minHeight: heroHeight }]}>
      {asset ? (
        <DashboardProfileImage
          asset={asset}
          fallbackSource={image}
          name={`${title} cover`}
          style={styles.heroBackground}
          imageStyle={styles.heroImage}
        />
      ) : (
        <ImageBackground
          imageStyle={styles.heroImage}
          resizeMode="cover"
          source={image}
          style={styles.heroBackground}
        />
      )}
      <LinearGradient
        colors={gradients.forestScrim}
        locations={[0.05, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroContent}>
        <View style={styles.heroTopRow}>
          {eyebrow ? (
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <AppText color={colors.inverse} numberOfLines={1} variant="overline">
                {eyebrow}
              </AppText>
            </View>
          ) : (
            <View />
          )}
          {profileAsset ? (
            <DashboardProfileImage
              asset={profileAsset}
              icon={icon}
              name={profileName}
              size={48}
              style={styles.heroAvatar}
            />
          ) : verificationStatus ? (
            <View style={styles.verificationPill}>
              <AppIcon color={colors.inverse} name={verification.icon} size={13} />
              <AppText color={colors.inverse} variant="micro">
                {verification.label}
              </AppText>
            </View>
          ) : null}
        </View>
        <View style={styles.heroCopy}>
          <AppText color={colors.inverse} numberOfLines={2} style={styles.heroTitle} variant="h2">
            {title}
          </AppText>
          {description ? (
            <AppText color="#E4F0EB" numberOfLines={3} style={styles.heroDescription} variant="footnote">
              {description}
            </AppText>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <View style={styles.heroAction}>
            <AppButton
              iconRight="arrow-right"
              onPress={onAction}
              size="sm"
              title={actionLabel}
              variant="cta"
            />
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function DashboardSection({
  eyebrow,
  title,
  subtitle,
  description,
  message,
  icon,
  actionLabel,
  onAction,
  children,
  style,
  contentStyle,
}) {
  const body = subtitle || description || message;

  return (
    <View style={[styles.section, style]}>
      {title || body || actionLabel ? (
        <View style={styles.sectionHeading}>
          <View style={styles.sectionCopy}>
            {eyebrow ? (
              <AppText color={colors.cta} variant="overline">
                {eyebrow}
              </AppText>
            ) : null}
            {title ? (
              <View style={styles.sectionTitleRow}>
                {icon ? (
                  <View style={styles.sectionIcon}>
                    <AppIcon color={colors.primary} name={icon} size={16} />
                  </View>
                ) : null}
                <AppText numberOfLines={2} style={styles.sectionTitle} variant="h3">
                  {title}
                </AppText>
              </View>
            ) : null}
            {body ? (
              <AppText color={colors.muted} style={styles.sectionSubtitle} variant="footnote">
                {body}
              </AppText>
            ) : null}
          </View>
          {actionLabel && onAction ? (
            <AppPressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onAction}
              style={styles.sectionAction}
            >
              <AppText color={colors.primary} variant="label">
                {actionLabel}
              </AppText>
              <AppIcon color={colors.primary} name="arrow-right" size={15} />
            </AppPressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.sectionBody, contentStyle]}>{children}</View>
    </View>
  );
}

export function DashboardCategoryCard({ image, title, subtitle, onPress, style }) {
  return (
    <AppPressable
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.categoryCard, style]}
    >
      <ImageBackground
        imageStyle={styles.categoryImage}
        resizeMode="cover"
        source={image}
        style={styles.categoryImage}
      >
        <LinearGradient
          colors={gradients.cardScrim}
          locations={[0.25, 1]}
          style={styles.categoryGradient}
        >
          <View style={styles.categoryText}>
            {subtitle ? (
              <AppText color="#D9E7E1" numberOfLines={1} variant="micro">
                {subtitle}
              </AppText>
            ) : null}
            <AppText color={colors.inverse} numberOfLines={2} variant="bodyStrong">
              {title}
            </AppText>
          </View>
        </LinearGradient>
      </ImageBackground>
    </AppPressable>
  );
}

/**
 * Feature card. Renders as an editorial image card when an image is supplied,
 * otherwise as a clean surface card. `subtitle` is accepted as an alias for
 * `description` because dashboard screens use both.
 */
export function DashboardModuleCard({
  image,
  icon = 'information-outline',
  eyebrow,
  title,
  subtitle,
  description,
  actionLabel,
  onAction,
  compact = false,
}) {
  const body = description || subtitle;

  if (image) {
    return (
      <View style={[styles.moduleCard, compact && styles.moduleCardCompact]}>
        <ImageBackground
          imageStyle={styles.moduleImage}
          resizeMode="cover"
          source={image}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={gradients.forestScrim}
          locations={[0.02, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.moduleContent}>
          <View style={styles.moduleIcon}>
            <AppIcon color={colors.inverse} name={icon} size={20} />
          </View>
          <View style={styles.moduleCopy}>
            {eyebrow ? (
              <AppText color="#D7E5DE" variant="overline">
                {eyebrow}
              </AppText>
            ) : null}
            <AppText color={colors.inverse} numberOfLines={2} variant="subtitle">
              {title}
            </AppText>
            {body ? (
              <AppText color="#E4F0EB" numberOfLines={3} variant="caption">
                {body}
              </AppText>
            ) : null}
          </View>
          {actionLabel && onAction ? (
            <AppButton
              fullWidth
              onPress={onAction}
              size="sm"
              title={actionLabel}
              variant="cta"
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.moduleLight, compact && styles.moduleLightCompact]}>
      <View style={styles.moduleLightIcon}>
        <AppIcon color={colors.primary} name={icon} size={20} />
      </View>
      <View style={styles.moduleLightCopy}>
        {eyebrow ? (
          <AppText color={colors.cta} variant="overline">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText numberOfLines={2} variant="h4">
          {title}
        </AppText>
        {body ? (
          <AppText color={colors.muted} numberOfLines={3} variant="caption">
            {body}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <AppButton
          onPress={onAction}
          size="sm"
          title={actionLabel}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

export function DashboardStatCard({ label, value, icon, tone = 'mint', style }) {
  const palette = statPalette(tone);

  return (
    <View style={[styles.statCard, style]}>
      <View style={[styles.statIcon, { backgroundColor: palette.surface }]}>
        <AppIcon color={palette.ink} name={icon} size={18} />
      </View>
      <AppText color={colors.text} numberOfLines={1} style={styles.statValue} variant="h2">
        {value}
      </AppText>
      <AppText color={colors.muted} numberOfLines={2} variant="caption">
        {label}
      </AppText>
    </View>
  );
}

export function DashboardProfileStatus({ percentage, completion, verificationStatus, onEdit }) {
  const raw = percentage ?? completion?.percentage ?? 0;
  const value = Math.max(0, Math.min(100, Number(raw) || 0));
  const verification = verificationLabel(verificationStatus);
  const completionLabel = value >= 100 ? 'Profile ready' : 'Profile strength';

  return (
    <View style={styles.statusCard}>
      <View style={styles.statusTop}>
        <View style={styles.statusRing}>
          <AppText color={colors.primary} variant="label">
            {`${Math.round(value)}%`}
          </AppText>
        </View>
        <View style={styles.statusCopy}>
          <View style={styles.statusTitleRow}>
            <AppText style={styles.statusTitle} variant="bodyStrong">
              {completionLabel}
            </AppText>
            <Badge label={verification.label} tone={verification.tone} />
          </View>
          <AppText color={colors.muted} numberOfLines={2} variant="caption">
            {value >= 100
              ? 'Your profile has everything customers look for.'
              : 'Add the remaining details to build trust and rank higher.'}
          </AppText>
        </View>
      </View>
      <ProgressBar height={7} tone="cta" value={value} />
      {onEdit ? (
        <AppButton icon="pencil-outline" onPress={onEdit} size="sm" title="Edit profile" variant="ghost" />
      ) : null}
    </View>
  );
}

export function DashboardDetail({ label, value, icon, last = false }) {
  const displayValue = formatProfileValue(value);
  if (!displayValue) {
    return null;
  }

  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      {icon ? (
        <View style={styles.detailIcon}>
          <AppIcon color={colors.primary} name={icon} size={17} />
        </View>
      ) : null}
      <View style={styles.detailCopy}>
        <AppText color={colors.muted} variant="caption">
          {label}
        </AppText>
        <AppText color={colors.text} numberOfLines={2} variant="bodyStrong">
          {displayValue}
        </AppText>
      </View>
    </View>
  );
}

export function DashboardProfileImage({
  asset,
  name,
  icon = 'account-outline',
  size,
  style,
  imageStyle,
  fallbackSource,
  onPress,
}) {
  const { session } = useAuth();
  const [remoteImage, setRemoteImage] = useState(null);
  const [failedAsset, setFailedAsset] = useState(null);
  const sessionToken = session?.token;
  const previewUri =
    typeof asset === 'string'
      ? /^(file|content|blob):/i.test(asset)
        ? asset
        : null
      : asset?.previewUri || null;
  const assetId = typeof asset === 'object' && asset ? asset.id : null;
  const assetKey = `${previewUri || assetId || ''}:${sessionToken || ''}`;
  const currentRemoteImage =
    remoteImage?.assetId === assetId && remoteImage?.token === sessionToken
      ? remoteImage
      : null;
  const imageError =
    currentRemoteImage?.error ||
    (failedAsset === assetKey ? 'The saved image could not be displayed.' : null);
  const loading = Boolean(assetId && !previewUri && !currentRemoteImage);
  const dimensionStyle = size ? { width: size, height: size, borderRadius: size / 2 } : null;
  const Wrapper = onPress ? AppPressable : View;

  useEffect(() => {
    let active = true;
    if (previewUri || !assetId) {
      return () => {
        active = false;
      };
    }

    getMediaUrlRequest({ token: sessionToken }, assetId)
      .then((url) => {
        if (active) {
          setRemoteImage({ assetId, token: sessionToken, uri: url });
        }
      })
      .catch((requestError) => {
        if (active) {
          setRemoteImage({
            assetId,
            token: sessionToken,
            error: requestError.message || 'The saved image could not be loaded.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [assetId, previewUri, sessionToken]);

  const imageUri = failedAsset === assetKey ? null : previewUri || currentRemoteImage?.uri;
  const showFallback = !imageUri && !loading && fallbackSource;

  return (
    <Wrapper
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[styles.assetWrap, dimensionStyle, style]}
    >
      {imageUri ? (
        <Image
          accessibilityLabel={name ? `${name} image` : 'Profile image'}
          onError={() => setFailedAsset(assetKey)}
          resizeMode="cover"
          source={{ uri: imageUri }}
          style={[styles.assetImage, imageStyle]}
        />
      ) : showFallback ? (
        <Image
          accessibilityLabel={name ? `${name} image` : 'Editorial image'}
          resizeMode="cover"
          source={fallbackSource}
          style={[styles.assetImage, imageStyle]}
        />
      ) : (
        <View style={[styles.assetPlaceholder, imageStyle]}>
          {loading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <AppIcon
                color={imageError ? colors.danger : colors.primary}
                name={imageError ? 'image-broken-variant' : icon}
                size={size ? Math.max(18, size * 0.42) : 26}
              />
              {imageError ? (
                <AppText color={colors.danger} variant="micro">
                  Unavailable
                </AppText>
              ) : null}
            </>
          )}
        </View>
      )}
      {loading && fallbackSource ? (
        <View pointerEvents="none" style={styles.assetLoadingOverlay}>
          <ActivityIndicator color={colors.inverse} size="small" />
        </View>
      ) : null}
    </Wrapper>
  );
}

export function DashboardProfileCard({
  title,
  name,
  subtitle,
  badge,
  profileAsset,
  asset,
  icon,
  onEdit,
  children,
}) {
  const displayName = title || name || 'Your profile';

  return (
    <AppCard contentStyle={styles.profileCardContent} padding="lg" variant="outlined">
      <DashboardProfileImage
        asset={profileAsset || asset}
        icon={icon || 'account-outline'}
        name={displayName}
        size={76}
        style={styles.profileCardImage}
      />
      <View style={styles.profileCardMain}>
        <View style={styles.profileCardHeading}>
          <AppText numberOfLines={1} style={styles.profileCardName} variant="h3">
            {displayName}
          </AppText>
          {badge ? <Badge label={badge} tone="primary" /> : null}
        </View>
        {subtitle ? (
          <AppText color={colors.muted} numberOfLines={2} variant="footnote">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {onEdit ? (
        <IconButton
          accessibilityLabel="Edit profile"
          icon="pencil-outline"
          onPress={onEdit}
          size="sm"
          variant="soft"
        />
      ) : null}
      {children}
    </AppCard>
  );
}

export function DashboardAccountTypeSwitcher({ currentRole } = {}) {
  return (
    <LinearGradient colors={gradients.mist} style={styles.accountSwitcher}>
      <View style={styles.accountSwitchTop}>
        <View style={styles.accountSwitchIcon}>
          <AppIcon color={colors.primary} name="swap-horizontal" size={22} />
        </View>
        <View style={styles.accountSwitcherCopy}>
          <AppText variant="h4">One account, four ways to work</AppText>
          <AppText color={colors.muted} style={styles.accountSwitchBody} variant="caption">
            {currentRole
              ? `You are working as ${currentRole}. Switch workspace any time.`
              : 'Switch between Customer, Professional, Business, and Hiring.'}
          </AppText>
        </View>
      </View>
      <AppButton
        fullWidth
        iconRight="arrow-right"
        onPress={() => router.replace('/home')}
        title="Switch account type"
        variant="white"
      />
    </LinearGradient>
  );
}

export function DashboardErrorScreen({ error, onRetry }) {
  const responsive = useResponsive();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={[styles.errorContent, { paddingHorizontal: responsive.horizontalPadding }]}>
        <View style={styles.errorMark}>
          <AppIcon color={colors.danger} name="cloud-alert-outline" size={30} />
        </View>
        <AppText align="center" variant="title">
          Dashboard unavailable
        </AppText>
        <AppText align="center" color={colors.muted} variant="footnote">
          {error?.message || 'Dashboard data could not be loaded.'}
        </AppText>
        <AppButton fullWidth onPress={onRetry} title="Try again" variant="primary" />
        <AppButton
          fullWidth
          onPress={() => router.replace('/home')}
          title="Back to account types"
          variant="ghost"
        />
      </View>
    </SafeAreaView>
  );
}

function statPalette(tone) {
  const map = {
    coral: { surface: colors.ctaSoft, ink: colors.cta },
    blue: { surface: colors.infoSoft, ink: colors.info },
    green: { surface: colors.successSoft, ink: colors.success },
    amber: { surface: colors.warningSoft, ink: colors.warning },
    mint: { surface: colors.primarySoft, ink: colors.primary },
  };
  return map[tone] || map.mint;
}

function verificationLabel(status) {
  if (status === 'verified') {
    return { label: 'Verified', icon: 'shield-check', tone: 'success' };
  }
  if (status === 'pending') {
    return { label: 'In review', icon: 'clock-outline', tone: 'warning' };
  }
  if (status === 'not_required') {
    return { label: 'Not required', icon: 'shield-check-outline', tone: 'primary' };
  }
  return { label: 'Not verified', icon: 'shield-outline', tone: 'neutral' };
}

function formatProfileValue(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  return '';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
  },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  brandMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  brandLogo: {
    width: 30,
    height: 30,
  },
  brandCopy: {
    flexShrink: 1,
    gap: 0,
  },
  brandName: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    flexGrow: 1,
    gap: spacing.xl,
    paddingTop: spacing.sm,
  },
  loadingHeader: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingContent: {
    flex: 1,
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  greetingAvatar: {
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primarySoft,
    ...shadows.soft,
  },
  greetingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
    maxWidth: '100%',
  },
  locationText: {
    flexShrink: 1,
  },
  hero: {
    justifyContent: 'flex-end',
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: colors.primaryDark,
    ...shadows.brand,
  },
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    borderRadius: radii.xxl,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    maxWidth: '72%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.cta,
  },
  verificationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroCopy: {
    maxWidth: 340,
    gap: spacing.xs,
  },
  heroTitle: {
    letterSpacing: -0.7,
  },
  heroDescription: {
    maxWidth: 300,
  },
  heroAction: {
    alignSelf: 'flex-start',
  },
  heroAvatar: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: colors.primarySoft,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  sectionTitle: {
    flexShrink: 1,
  },
  sectionSubtitle: {
    marginTop: 1,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingBottom: spacing.xxs,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  categoryCard: {
    width: 152,
    height: 172,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    ...shadows.card,
  },
  categoryImage: {
    width: '100%',
    height: '100%',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  categoryGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  categoryText: {
    gap: spacing.xxs,
  },
  moduleCard: {
    minHeight: 196,
    justifyContent: 'flex-end',
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    ...shadows.card,
  },
  moduleCardCompact: {
    minHeight: 168,
  },
  moduleImage: {
    borderRadius: radii.xl,
  },
  moduleContent: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  moduleIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  moduleCopy: {
    gap: spacing.xxs,
  },
  moduleLight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  moduleLightCompact: {
    padding: spacing.md,
  },
  moduleLightIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  moduleLightCopy: {
    flex: 1,
    minWidth: 150,
    gap: 2,
  },
  statCard: {
    flex: 1,
    minWidth: 104,
    minHeight: 122,
    justifyContent: 'space-between',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  statIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  statValue: {
    letterSpacing: -0.6,
  },
  statusCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  statusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusRing: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.ctaMuted,
    borderRadius: radii.round,
    backgroundColor: colors.ctaSoft,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusTitle: {
    flexShrink: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  detailIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  assetWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  assetPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.primarySoft,
  },
  assetLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,42,32,0.18)',
  },
  profileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  profileCardImage: {
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  profileCardMain: {
    flex: 1,
    minWidth: 150,
    gap: 3,
  },
  profileCardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  profileCardName: {
    flexShrink: 1,
  },
  accountSwitcher: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.soft,
  },
  accountSwitchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountSwitchIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  accountSwitcherCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  accountSwitchBody: {
    lineHeight: 17,
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorMark: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.xl,
    backgroundColor: colors.dangerSoft,
  },
});
