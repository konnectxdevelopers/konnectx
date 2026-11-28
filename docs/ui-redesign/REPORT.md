# KonnectX — Phase 10 Premium UI/UX Redesign & Stabilisation

Date: 2026-11-28
Scope: application-wide visual/UX redesign + responsive/quality stabilisation of the existing
Phase 1–10 app. **No Phase 11 features were added. No fake screens, fake data, or mocked
API responses were introduced.** Frontend-only changes; the backend was not edited.

---

## 1. Screen inventory (all implemented screens)

### Entry / auth / marketing
| Route | Screen | Notes |
| --- | --- | --- |
| `/` | `index` | Boot / redirect resolver |
| `/language` | Language selection | EN / Telugu / Hindi |
| `/welcome` | Welcome / value proposition | Marketing + CTA |
| `/home` | Account-type chooser | 4 role cards |
| `/login` | Sign in (`AccountScreen mode=login`) | Email + password |
| `/signup` | Create account (`AccountScreen mode=signup`) | Name/email/phone/password |
| `/verify-otp` | OTP verification | 6-digit code, resend cooldown |
| `/reset-password` | Password reset | Request + confirm |
| `/profile-setup` | Base profile setup | Name, photo |
| `/role-profile/[role]` | Role profile wizard | Multi-step, per-role fields |

### Dashboards (4 roles)
| Route | Dashboard | Tabs / sections |
| --- | --- | --- |
| `/dashboard/[role]` (customer) | Customer | Home, Explore (services / products / jobs / projects / professionals / businesses), Saved, Enquiries, Applications, Profile |
| `/dashboard/[role]` (professional) | Professional | Studio, Services, Bookings, Earnings, Profile |
| `/dashboard/[role]` (business) | Business | Overview, Services, Products, Bookings, Team, Profile |
| `/dashboard/[role]` (hiring) | Hiring | Talent, Jobs, Applicants, Shortlisted, Profile |
| `/(roles)/customer|professional|business|hiring` | Role landing redirects | Role-guard wrappers |

### Marketplace discovery & detail
| Route | Screen |
| --- | --- |
| `/listing/[id]` | Unified listing detail (service / product / job / project / professional / business), preview mode, save, enquiry |
| `/service/[id]` | Service detail (gallery, packages, availability, policies, save, enquire) |
| `/product/[id]` | Product detail (gallery, variants, stock, save, shop) |
| `/job/[id]` | Job detail (salary, requirements, apply with resume upload) |
| `/business-shop` | Storefront/shop settings |
| `/my-listings` | Unified listing overview + preview + history |
| `/listing-editor` | Create/edit listing (category-driven fields) |

### Management
| Route | Screen |
| --- | --- |
| `/marketplace-manage` | Portfolio / skills / projects / hiring-capability management |
| `/marketplace-enquiries` | Sent & received enquiries |
| `/manage-services` | Service CRUD, lifecycle, media |
| `/manage-products` | Product catalogue, variants, stock, lifecycle |
| `/manage-jobs` | Vacancy CRUD, publish/pause/close |
| `/employer-applications` | Applicant pipeline / status changes |

### Shared feature screens / components
`DashboardLayout`, `DashboardGreeting`, `DashboardHero`, `DashboardSection`,
`DashboardModuleCard`, `DashboardStatCard`, `DashboardProfileCard`,
`DashboardProfileStatus`, `DashboardProfileImage`, `DashboardDetail`,
`DashboardAccountTypeSwitcher`, `DashboardErrorScreen`, `DashboardLoadingScreen`,
`ProductCard`, `ServiceListingCard`, `ListingPreviewContent`.

---

## 2. Audit findings (root causes of the “broken UI”)

The app had a systemic **component contract drift**: screens were written against prop names and
design tokens that the shared primitives no longer exposed. Because most of these fail silently
(undefined style / ignored prop / empty text), many screens looked broken without crashing.

| # | Defect | Impact | Evidence |
| --- | --- | --- | --- |
| 1 | `Badge` only accepted `tone`; call sites passed `variant` (~45 attributes / 11 files) | All status/stock/category badges rendered in the default brand colour | `manage-products`, `product/[id]`, dashboards, detail screens |
| 2 | `EmptyState` expected `description`/`action`; call sites passed `message`/`actionLabel`/`onAction` | Empty lists lost their explanation and CTA | `manage-products`, `manage-jobs`, `product/[id]` |
| 3 | `ErrorState` expected `description`/`retryLabel`; call sites passed `message` | Error text never displayed | 10 screens |
| 4 | `AppHeader` had no `rightAction` support | Missing header shortcuts (products, applications, shop) | `business-shop`, `manage-products`, `manage-jobs`, `product/[id]` |
| 5 | `AppButton`/`AppInput` ignored `containerStyle` (~20 each) | Paired flex buttons/fields collapsed or mis-sized | management forms, action rows |
| 6 | `ToastProvider.showToast` destructured an object only; 15 call sites used `showToast('text', 'success')` | Blank/undefined toasts on save, delete, status changes | `service/[id]`, `listing/[id]`, dashboards |
| 7 | Missing tokens: `colors.surfaceAlt`, `shadows.sm`, `shadows.md`, `radii.full`; variants `h3`, `h4`, `micro` | Cards fell back to transparent backgrounds / no shadow; typography silently downgraded to `body` | `ProductCard`, `ServiceListingCard`, dashboards |
| 8 | `ProgressBar` accepted only `progress` (0–1) while some call sites passed `value` (0–100) | Completion bars wrong or stuck | profile completion, setup |
| 9 | `showBack` rendered without `onBack` on some screens | Dead back buttons | `marketplace-*`, editor screens |
| 10 | No header/back affordance at all on 6 pushed screens | Trapped users (system gesture only) | `manage-products`, `manage-jobs`, `business-shop`, `employer-applications`, `job/[id]`, `product/[id]` |
| 11 | Modals were not keyboard-aware and had no scroll body | Forms covered by keyboard / unreachable submit buttons | product/service/job editors |
| 12 | All content containers full-width on tablets/web; no reading measure | Stretched cards, very long text lines | auth + all `src/app` screens |
| 13 | `style={styles.scroll}` referenced a non-existent style key | Missing flex on two scroll views | `HomeScreen`, `ProfileScreen` |
| 14 | Professional “Profile Strength” defaulted to **100%** when completion was absent | Misleading completion state | `ProfessionalDashboardScreen` |
| 15 | Lists render via `.map` inside `ScrollView` | No virtualisation on long lists | all management screens |
| 16 | `server/.env.example` contains live-looking TiDB/B2/Gmail secrets | Security risk (pre-existing, not touched) | `server/.env.example` |

Fixed: 1–14. Left as documented follow-ups: 15–16 (see §14).

---

## 3. Redesigned screens

- **All four role dashboards** — shared chrome (`DashboardLayout`) rebuilt: branded header with
  responsive gutters, safe-area aware floating tab bar (dark “brand” variant), consistent section
  headers, module cards, stat cards, profile cards, profile-strength card, account switcher, and
  premium empty/error/loading states. Empty tabs (Bookings, Earnings, Team, Shortlisted, etc.)
  show honest “nothing here yet” states — **no fabricated numbers**.
- **Customer discovery** — greeting, search, editorial hero, six marketplace entry points,
  category rail, service rail with redesigned cards, upcoming-bookings empty state, and the
  Explore tab with filters (unchanged data flow).
- **Professional** — identity banner + real metrics (active services, starting rate), listing
  shortcuts, services rail, booking-requests state, profile strength (now truthful), and profile
  details.
- **Business** — shop/services/products modules, real counts from APIs, management shortcuts.
- **Hiring** — recruitment hero, pipeline stats (active jobs / applicants / shortlisted), hiring
  focus chips, recent applications, plus jobs/applicants/shortlisted/profile tabs.
- **Marketplace cards** — `ProductCard` and `ServiceListingCard` rebuilt with consistent media
  aspect ratios, discount/stock/provider badges, price hierarchy, variant count, shop/location
  footer, verified markers, and graceful image fallback.
- **Detail screens** — `listing/[id]`, `service/[id]`, `product/[id]`, `job/[id]` now have a
  header with back navigation in every state (loading, error, content), centred reading measure,
  safe-area handling, and consistent card/section rhythm.
- **Management screens** — `manage-products`, `manage-jobs`, `manage-services`, `my-listings`,
  `marketplace-manage`, `marketplace-enquiries`, `employer-applications`, `business-shop`,
  `listing-editor` now have back navigation, capped content width, working header shortcuts, and
  functional empty/error states.
- **Auth / onboarding** — welcome, account, OTP, password reset, base profile, language, account
  type, role landing, role profile wizard: centred max-width layouts, consistent header spacing,
  no clipped content.

---

## 4. Layout & responsive fixes

- `useResponsive` rewritten and kept backward compatible (`horizontalPadding`, `contentWidth`,
  `maxContentWidth`, `columns`, `cardColumns`, `gutter`, `isSmall/isCompact/isTablet/isWide`).
  Compact padding on `<360dp`, larger gutters on tablets, 560px reading measure.
- Added `layout` tokens (`contentMaxWidth`, `tabBarHeight`, `tabBarSpace`, `inputHeight`,
  `buttonHeight`, `cardRadius`, `imageAspect`, `thumbAspect`).
- All auth/onboarding/detail/management content containers now use
  `alignSelf: center; width: 100%; maxWidth: 600` so phones get edge padding and tablets/web get a
  centred column (verified in screenshots at 500px and 800px).
- Dashboard content uses `maxWidth: responsive.maxContentWidth` and clears the floating tab bar
  with 128px bottom padding.
- Hiring stat row now wraps with a 96px minimum tile so three stats never crush on small phones.

---

## 5. Oversized / overflow / clipping fixes

- Badges/status labels now shrink and truncate (`flexShrink`, `numberOfLines`) instead of pushing
  card layouts wide.
- `AppButton` labels use `adjustsFontSizeToFit` + `numberOfLines={1}` inside a flex-shrink row, so
  long titles and paired buttons no longer overflow.
- `AppHeader` title uses `adjustsFontSizeToFit` with `minimumFontScale={0.86}` and a `minWidth: 0`
  copy column — long listing/job titles no longer push the action buttons off-screen.
- `AppTabBar` compacts icon/label size for 5-tab bars and narrow devices.
- Card media uses aspect ratios (`4/3`, `16/10`) instead of fixed heights; compact/horizontal
  variants use a fixed thumb column with a flexible body.
- `AppModal` body is now a bounded scroll area (`58%` of window height) with the action row kept
  outside the scroll region, so long forms and previews are always actionable.
- Every `styles.X` reference was statically checked against its `StyleSheet.create` keys; two
  undefined references (`styles.scroll`) were found and fixed.

---

## 6. Alignment & spacing

- Unified vertical rhythm through `spacing` tokens; removed ad-hoc numbers in the shared layer.
- `AppText` variants rebalanced (`h3` 21/28, `h4` 17/23, `micro` 11/15) so section titles,
  card titles and meta labels form a clear hierarchy.
- Consistent 8/12/16/20 padding scale across cards, sections and list rows.
- Section headers: eyebrow → title → supporting copy → “see all” action aligned to the baseline.
- All horizontal rails align to the same gutter as page content.

---

## 7. Design system

Token-driven, no gradients/shadows overused.

- **Colour** (60/30/10): canvas `#F6F7F5`, surface white / `#EEF2F0` / `#EDF2EF`, ink
  `#101917`–`#98A29D`, forest brand `#0B3B2E`, citrus CTA `#FF6B2C`, plus feedback tones with
  matching soft/border tokens. Legacy aliases kept so older modules still render.
- **Type**: display → h1–h4 → title/subtitle/headline/body/bodyStrong/footnote/caption/label/
  overline/micro; single font family, tuned line heights and negative tracking on headings.
- **Radii**: xs 6 → pill 999 (+ `full` alias).
- **Shadows**: `none`, `soft`, `card`, `sm`, `md`, `brand`, `cta`, `floating` (Platform-selected,
  Android elevation equivalents).
- **Gradients**: forest, forest scrim, horizontal, citrus, mist, aurora, amber, glass, card scrim,
  image placeholder.
- **Motion**: shared durations/spring used by toasts, tab transitions, press feedback.

---

## 8. Shared components created/upgraded

| Component | Change |
| --- | --- |
| `Badge` | `tone` **and** `variant`; sm size; dot; icon; truncation; full tone palette (incl. outline, dark, gold) |
| `EmptyState` | `description/message`, `action/actionLabel/onAction/actionIcon`; haloed icon; compact mode |
| `ErrorState` | `description/message`, `actionLabel/retryLabel`; retry button |
| `AppHeader` | `rightAction`, `left`, `right`, eyebrow/subtitle, centred mode, responsive gutters, safe top option, back button whenever `onBack` is provided |
| `AppButton` | `containerStyle`, `uploadingMedia`, size scale, auto-shrink labels, loading state, no-wrap content |
| `AppInput` | `containerStyle`, focus/error styling, reveal-password, char counter, keyboard “next” navigation |
| `ProgressBar` | accepts `value` (0–100) **or** `progress` (0–1), `color`/`trackColor`, a11y values |
| `AppModal` | keyboard avoidance, bounded scroll body, safe-area bottom margin, responsive padding |
| `BottomSheet` | spring enter, animated dismiss, scrollable option, handle, keyboard avoidance |
| `AppTabBar` | floating pill, `brand` and `light` variants, safe-area offset, 5-tab compaction, a11y tabs |
| `Toast` | supports `showToast(text, variant)` **and** `showToast({...})` **and** `showToast(text, {variant})`; exposes `show` alias |
| `useResponsive` | new tablet/compact breakpoints + content measure |

---

## 9. Files modified (frontend, this redesign)

**Theme**
- `src/theme/tokens.js`
- `src/theme/useResponsive.js`

**UI primitives**
- `src/components/ui/AppButton.jsx`, `AppHeader.jsx`, `AppInput.jsx`, `AppModal.jsx`,
  `AppTabBar.jsx`, `Badge.jsx`, `BottomSheet.jsx`, `EmptyState.jsx`, `ErrorState.jsx`,
  `ProgressBar.jsx`, `Toast.jsx`

**Dashboards / shared dashboard layer**
- `src/features/profile/DashboardUi.jsx`
- `src/features/profile/ProfessionalDashboardScreen.jsx`
- `src/features/profile/HiringDashboardScreen.jsx`
- (`CustomerDashboardScreen.jsx` and `BusinessDashboardScreen.jsx` are diffed against the
  pre-redesign baseline, but their current content relies on the shared layer above.)

**Marketplace components**
- `src/features/marketplace/ProductCard.jsx`
- `src/features/marketplace/ServiceListingCard.jsx`

**Auth / onboarding**
- `src/features/auth/AccountScreen.jsx`, `OtpScreen.jsx`, `PasswordResetScreen.jsx`,
  `ProfileScreen.jsx`, `ProfileSetupScreen.jsx`, `WelcomeScreen.jsx`
- `src/features/home/HomeScreen.jsx`
- `src/features/onboarding/LanguageSelectionScreen.jsx`
- `src/features/profile/RoleProfileSetupScreen.jsx`
- `src/features/roles/RoleLandingScreen.jsx`

**Routes**
- `src/app/listing/[id].jsx`, `service/[id].jsx`, `product/[id].jsx`, `job/[id].jsx`
- `src/app/business-shop.jsx`, `employer-applications.jsx`, `manage-jobs.jsx`,
  `manage-products.jsx`, `manage-services.jsx`, `my-listings.jsx`, `listing-editor.jsx`,
  `marketplace-manage.jsx`, `marketplace-enquiries.jsx`

> Note: the working tree also contains uncommitted Phase 7–10 changes that predate this
> redesign (`server/*`, `marketplaceService`, `roleProfileService`, `roleProfileDefinitions`,
> `_layout`, etc.). Those were **not** authored by this redesign pass and were left untouched.

---

## 10. Backend files modified

**None.** No change was made to any file under `server/`, no SQL migration was added, and no
environment/credential file was edited. Node/Express routes, TiDB schema, B2 storage integration,
JWT auth, role permissions, moderation and publishing workflows are exactly as found.

---

## 11. API connections preserved

- Every existing endpoint call is retained; no request/response shape was changed.
- Service modules (`src/services/**`) were not modified in this pass, so API contracts are
  identical to the Phase 10 backend.
- All data shown on dashboards, cards and detail screens still comes from the existing APIs
  (services, products, jobs, applications, enquiries, favourites, profiles, media URLs, shop
  settings). Nothing was replaced with hardcoded values.
- Navigation paths and role guards are unchanged; only back affordances and layout were added.

---

## 12. Testing performed

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npx expo lint` | Pass — no errors/warnings emitted |
| Android production bundle | `npx expo export --platform android` | Pass — 1 Hermes bundle produced (all routes compiled) |
| Web production bundle | `npx expo export --platform web` | Pass — all route chunks built |
| Backend regression suite | `npm --prefix server test` | Pass — 26/26 tests, 0 failures |
| Static prop audit | script | No unknown props on UI primitives (after fixes) |
| Token audit | script | No undefined `colors/radii/shadows/spacing/gradients/motion` keys |
| Type/variant audit | script | No unsupported `AppText` variants |
| Style-key audit | script | No undefined `styles.*` references |
| UI screenshots | Headless Chrome against the web build | Captured (see §13) |

**Not verified (honest gaps):** no Android/iOS emulator or physical device was available, so the
authenticated dashboards, modals, keyboards, gestures and B2 image rendering were **not** visually
confirmed on-device. Chrome headless on Windows also enforces a ~500px minimum viewport, so true
360–390dp phone rendering could only be reasoned about from the layout code, not screenshotted.
No live API calls were exercised from the UI (no test account was created in the production TiDB
instance).

---

## 13. Screenshots

Stored in `docs/ui-redesign/` (rendered from the real production web build):

| File | Screen | Width |
| --- | --- | --- |
| `welcome-500.png` / `welcome-800.png` | Welcome | 500 / 800 |
| `login-500.png` / `login-800.png` | Sign in | 500 / 800 |
| `signup-800.png` | Create account | 800 |
| `language-800.png` | Language selection | 800 |
| `home-500.png` / `home-800.png` | Account type | 500 / 800 |

The 800px shots demonstrate the new centred reading measure; the 500px shots demonstrate the
compact/phone layout.

---

## 14. Remaining issues & recommended follow-ups

1. **Authenticated dashboard visual QA** — needs a device/emulator and a real account. Code-level
   audits and bundle checks pass, but the four dashboards, modals and keyboards must be reviewed
   on-device before Phase 11.
2. **Session persistence** — auth state lives in memory only (`AuthProvider`), so a reload signs
   the user out (pre-existing). Deliberately not changed here because it touches auth behaviour.
3. **List virtualisation** — long management/discovery lists still use `.map` inside
   `ScrollView`. Converting to `FlatList`/`SectionList` is safe but a larger refactor; recommended
   as a performance follow-up.
4. **Dark mode** — the app is light-only (`userInterfaceStyle: light`); no dark tokens yet.
5. **Duplicate `EXPO_PUBLIC_API_URL`** in root `.env` (localhost then LAN IP); the last value wins.
   Should be reduced to one value per environment.
6. **Secrets in `server/.env.example`** (TiDB password, B2 keys, Gmail app password) should be
   revoked/rotated and replaced with placeholders. Security issue predating this work.
7. **On-device font scaling** — very large OS text sizes were not tested; `adjustsFontSizeToFit`
   is used on buttons/headers but body copy still reflows.

---

## 15. Approval gate

Phase 11 has **not** started. This redesign is ready for your personal review:

1. Open `docs/ui-redesign/*.png` for the auth/onboarding result.
2. Run `npx expo start` and walk all four roles on a device/emulator.
3. Approve, or send a list of screens to refine, before Phase 11 begins.
