# KonnectX API

This server is a separate Node.js service for authentication, role selection,
role-specific profile persistence, registration status, and private B2 uploads.
It is not bundled into Expo Go.

## Configure

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and `CORS_ORIGINS`.
3. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` to a Gmail account and its Google
   App Password. Do not use the account's normal password. Keep these values in
   the ignored server `.env`, never in the Expo app or `EXPO_PUBLIC_*` variables.
4. Configure the B2 S3-compatible endpoint, bucket, region, and application key
   only when private uploads are ready.
5. Apply `src/schema.sql` to the TiDB database using an administrator-managed
   SQL client, then run `npm run migrate` to seed versioned marketplace data.
   The API does not run schema DDL automatically.

Do not commit `.env`. Use rotated credentials; credentials pasted into chat or
workspace instructions should be revoked and replaced.

## Run

```sh
npm install
npm test
npm start
```

The API listens on `0.0.0.0:PORT` so Expo Go devices on the same LAN can reach
it. `GET /api/v1/health` (and the backwards-compatible `GET /health`) reports
API status, database connectivity, and `NODE_ENV` without exposing
infrastructure details. HTTP 200 means the database query succeeded; HTTP 503
means the API is running but the database is unavailable. Startup logs report
the TiDB connection result and explicitly identify port conflicts.

## Expo app

From the project root, configure `EXPO_PUBLIC_API_URL` to the reachable base URL
of this server, then run `npm install` and `npx expo start`. For Expo Go, the
client replaces a local loopback URL with the Metro host address so the phone
reaches the computer over the LAN. If using a remote API, configure its HTTPS
base URL instead. This variable is public and must contain only the API URL,
never database, SMTP, or B2 credentials.

## API

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/email-verification/request`
- `POST /api/v1/auth/email-verification/verify`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `GET/PATCH /api/v1/users/me`
- `POST /api/v1/users/select-role`
- `GET /api/v1/users/registration-status`
- `GET/PUT /api/v1/profiles/:role` for customer, professional, business, hiring
- `GET /api/v1/dashboard/customer`
- `GET /api/v1/dashboard/professional`
- `GET /api/v1/dashboard/business`
- `GET /api/v1/dashboard/hiring`
- `GET /api/v1/health`
- `POST /api/v1/uploads/presign`
- `POST /api/v1/uploads/complete`
- `GET /api/v1/uploads/:id/url`
- `GET /api/v1/services/categories`
- `GET /api/v1/categories/tree?section=product`
- `GET /api/v1/categories/:id/attributes`
- `GET /api/v1/services/categories/:id`
- `GET /api/v1/services`
- `GET /api/v1/services/:id`
- `GET /api/v1/professionals/:id/services`
- `GET /api/v1/businesses/:id/services`
- Authenticated provider service create, edit, publish, pause, delete, and media
  management routes under `/api/v1/services`
- `GET /api/v1/services/my-services`
- `GET /api/v1/marketplace/sections`
- `GET /api/v1/listings` and `GET /api/v1/listings/sections/:type` provide
  paginated public discovery across eligible listing types; `GET /api/v1/listings/:id`
  returns a public listing detail
- `GET/POST /api/v1/marketplace/products`
- `GET/POST /api/v1/marketplace/jobs`
- `GET/POST /api/v1/marketplace/projects`
- Project owner routes under `/api/v1/marketplace/my-projects` and
  `/api/v1/marketplace/projects/:id/transition`
- Proposal submission, owner review, status history, and private attachment
  routes under `/api/v1/marketplace/projects` and `/api/v1/marketplace/proposals`
- `GET /api/v1/marketplace/professionals`
- `GET /api/v1/marketplace/businesses`
- Discovery filters include text, location, category, skill, experience, budget,
  deadline, work mode, and section-specific sort options where applicable
- Authenticated product, job, project and portfolio management routes under
  `/api/v1/marketplace`
- Authenticated favorites and enquiry routes under `/api/v1/marketplace`
- `POST /api/v1/uploads/presign` and `/api/v1/uploads/complete` support service,
  product, portfolio, and project media; project attachments remain private
- Published product and portfolio images are served through short-lived,
  listing-eligibility-checked URLs at `/api/v1/marketplace/media/:id/url`

### Freelance projects

Hiring accounts can post projects. Business accounts can post only when their
`business_profiles.hiring_enabled` capability is enabled. Customer and
Professional accounts cannot post projects. Professional accounts can submit
proposals; Business proposal submission is disabled unless
`BUSINESS_PROJECT_PROPOSALS_ENABLED=true` is explicitly configured.

Projects use their own lifecycle and discovery endpoint, separate from jobs
and services. Owner project and proposal-management endpoints are authenticated
and owner-scoped. Public discovery returns only published, active, public
projects and is paginated. Project attachments and proposal attachments are
stored as private B2 objects and served through short-lived, authorization-
checked URLs.

`npm run migrate` applies the Phase 11 project/proposal schema and the
`proposal_milestones` extension. Proposed milestones are planning data only;
contracts, escrow, milestone payments, messaging, and dispute handling are not
implemented.

Profile writes are scoped to the authenticated JWT subject. `PUT` accepts draft
updates; pass `{ "submit": true }` to request completion. A profile is not
marked complete until the server validates required fields. `verified` is never
accepted from the client.

Dashboard reads are scoped to the JWT subject and require an assignment in
`user_roles` for the requested role. The API returns that account's saved role
profile, freshly computed completion status, and verification status. Existing
primary keys on `user_roles (user_id, role)` and each role profile's `user_id`
support these reads; no schema migration is required for the dashboard API.

The versioned marketplace migrations create the category tree and category
attributes, listing-type links, products, jobs, freelance projects, professional
skills and portfolio items, product variants, business categories, favorites,
enquiries, and media relationships alongside the service catalog. Run
`npm run migrate` after applying the base schema; migrations are versioned and
safe to rerun. Phase 8 adds category-driven service rules and booking-readiness
fields. The command converts legacy professional/business profile `services`
values into idempotently keyed, unpublished draft service records, then
backfills profile listing identities and prints migration/unmapped reports.
Providers must review and publish those drafts. The Phase 7 rollback preserves removed listing
metadata and status history in `phase7_rollback_backup`; the Phase 6 service
category rollback intentionally leaves `services.category_id` nullable so
saved drafts are not discarded or assigned an incorrect category.
The Phase 8 rollback backs up service-only data and category rules in
`phase8_rollback_backup`, while retaining legacy migration keys to prevent
duplicate service creation if the migration is applied again.

Public discovery returns only records whose shared listing identity is
published and explicitly public. Legacy create endpoints reject direct
publication when review is required. The legacy service status endpoint
applies the shared lifecycle rules and records status history. Listing writes
use the authenticated user ID, check assigned roles, and preserve owner-only
management.

Professional and business services are actual rows in `services`, linked to
their existing provider profile and shared `marketplace_listings` identity.
Category rules are returned by service category APIs and enforced when a service
is submitted or published. Service discovery is server-filtered and paginated;
it supports category, text/location, price model/range, delivery method,
provider role, availability, verification, and real review ratings. Location
search is textual; distance ranking and booking execution are not implemented.

Favorites and customer-to-owner enquiries have authenticated APIs and dashboard
flows. Service bookings, job applications, freelance proposals, notifications,
earnings, reviews, business teams, candidate shortlisting, and interviews do not
yet have persistence or user flows and remain unavailable.

Phase 9 reuses the business profile and shared product listing identity. Business
shop settings and optional locations are available under `/api/v1/business/shop`;
business product management, variants, stock adjustments, transitions, and
customer discovery/detail are under `/api/v1/marketplace/products`. Category
rules drive product attributes and filterable facets. Product images and shop
logo/cover images use authenticated private B2 uploads; published product
images are served through listing-eligibility-checked URLs. Checkout, cart,
orders, shipping tracking, and payments are not implemented; product detail
offers only the existing enquiry/contact action.

The Phase 9 down script first snapshots shop settings, product/variant metadata,
shop locations, inventory adjustments, and category rules in
`phase9_rollback_backup`. It deliberately retains the schema because the base
schema also declares these fields and dropping them could invalidate live
products. Export the backup table and schedule a separately reviewed data
retention plan before removing Phase 9 tables or columns.

The Expo role-registration screens save drafts after each step and use the same
profile endpoints to resume. Image, PDF, and MP4 uploads use short-lived
authenticated presigned URLs; the B2 bucket must remain private.

## Remaining provider setup

Account verification and password resets use Gmail email codes; phone verification
is not required to complete customer or individual hiring profiles. Phone fields
remain available for contact where relevant. B2 uploads require server-side B2
credentials and a private bucket. Never put these credentials in Expo
`EXPO_PUBLIC_*` values.
