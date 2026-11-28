import { randomUUID } from 'node:crypto';
import {
  attachMediaToListing,
  detachMediaFromListing,
  getModerationPolicy,
  getUserCapabilities,
  hydrateUnifiedListings,
  LISTING_STATUSES,
  normalizeUnifiedListingInput,
  parseJson,
  recordStatusHistory,
  reorderListingMedia,
  requiresReviewForType,
  resolveOwnerRoleForType,
  UNIFIED_LISTING_SELECT,
  validateAdminModeration,
  validateAndResolveCategory,
  validateOwnerTransition,
  withTransaction,
} from './listing-engine.js';
import {
  CANONICAL_LISTING_TYPES,
  normalizeListingType,
  syncMarketplaceListing,
} from './marketplace-listings.js';
import {
  loadServiceCategoryRules,
  validateServiceCategoryRules,
} from './service-category-rules.js';

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

function slugify(value) {
  return String(value || 'listing')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 170);
}

async function fetchListingRow(pool, id) {
  const [rows] = await pool.query(
    `SELECT * FROM marketplace_listings WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchHydratedListing(pool, config, id, { audience = 'owner', publicOnly = false } = {}) {
  const publicFilter = publicOnly
    ? `AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'`
    : '';
  const [rows] = await pool.query(
    `${UNIFIED_LISTING_SELECT} WHERE ml.id = ? ${publicFilter} LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const [hydrated] = await hydrateUnifiedListings(pool, rows, config, { audience });
  return hydrated || null;
}

function serviceCategoryPayload(listing) {
  return {
    ...listing.details,
    title: listing.title,
    shortDescription: listing.shortSummary,
    description: listing.description,
    categoryId: listing.categoryId,
    subcategoryId: listing.subcategoryId,
  };
}

async function validateServiceRules(pool, listing, { requireComplete }) {
  if (listing.listingType !== 'service') return null;
  const rules = await loadServiceCategoryRules(pool, listing.categoryId);
  return validateServiceCategoryRules(rules, serviceCategoryPayload(listing), { requireComplete });
}

async function persistTypeSpecificEntity(connection, { listingId, entityId, listingType, ownerUserId, ownerRole, normalized, status }) {
  const d = normalized.details;
  if (listingType === 'service') {
    const slug = `${slugify(normalized.title) || 'service'}-${listingId.slice(0, 8)}`;
    await connection.query(
      `INSERT INTO services (
         id, provider_user_id, provider_role, category_id, subcategory_id,
         slug, title, short_description, description, delivery_method,
         duration_value, duration_unit, inclusions, exclusions,
         customer_requirements, terms_and_conditions,
         booking_lead_time_hours, cancellation_policy, packages, addons,
         custom_attributes, booking_constraints, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category_id = VALUES(category_id),
         subcategory_id = VALUES(subcategory_id),
         title = VALUES(title),
         short_description = VALUES(short_description),
         description = VALUES(description),
         delivery_method = VALUES(delivery_method),
         duration_value = VALUES(duration_value),
         duration_unit = VALUES(duration_unit),
         inclusions = VALUES(inclusions),
         exclusions = VALUES(exclusions),
         customer_requirements = VALUES(customer_requirements),
         terms_and_conditions = VALUES(terms_and_conditions),
         booking_lead_time_hours = VALUES(booking_lead_time_hours),
         cancellation_policy = VALUES(cancellation_policy),
         packages = VALUES(packages),
         addons = VALUES(addons),
         custom_attributes = VALUES(custom_attributes),
         booking_constraints = VALUES(booking_constraints),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        entityId,
        ownerUserId,
        ownerRole,
        normalized.categoryId,
        normalized.subcategoryId,
        slug,
        normalized.title,
        normalized.shortSummary || normalized.title,
        normalized.description || '',
        d.deliveryMethod,
        d.durationValue,
        d.durationUnit,
        JSON.stringify(d.inclusions || []),
        JSON.stringify(d.exclusions || []),
        d.customerRequirements,
        d.termsAndConditions,
        d.bookingLeadTimeHours ?? null,
        d.cancellationPolicy ?? null,
        JSON.stringify(d.packages || []),
        JSON.stringify(d.addons || []),
        JSON.stringify(d.customAttributes || {}),
        JSON.stringify(d.bookingConstraints || {}),
        status,
      ]
    );
    await connection.query(
      `INSERT INTO service_pricing (service_id, pricing_type, amount, min_price, max_price, currency)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pricing_type = VALUES(pricing_type),
         amount = VALUES(amount),
         min_price = VALUES(min_price),
         max_price = VALUES(max_price),
         currency = VALUES(currency)`,
      [entityId, d.pricingType, d.price, d.minPrice, d.maxPrice, d.currency]
    );
    await connection.query('DELETE FROM service_locations WHERE service_id = ?', [entityId]);
    for (const [index, loc] of (d.locations || []).entries()) {
      await connection.query(
        `INSERT INTO service_locations (id, service_id, country, state, city, area, radius_km, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), entityId, loc.country || null, loc.state || null, loc.city, loc.area || null, loc.radiusKm || null, index === 0]
      );
    }
    await connection.query('DELETE FROM service_availability WHERE service_id = ?', [entityId]);
    for (const slot of d.availability || []) {
      await connection.query(
        `INSERT INTO service_availability (id, service_id, day_of_week, start_time, end_time, is_unavailable)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), entityId, slot.dayOfWeek, `${slot.startTime}:00`, `${slot.endTime}:00`, Boolean(slot.isUnavailable)]
      );
    }
    await connection.query('DELETE FROM service_tags WHERE service_id = ?', [entityId]);
    for (const tag of d.tags || []) {
      await connection.query('INSERT IGNORE INTO service_tags (service_id, tag) VALUES (?, ?)', [entityId, tag]);
    }
    return;
  }

  if (listingType === 'product') {
    await connection.query(
      `INSERT INTO products (
         id, seller_user_id, seller_role, category_id, subcategory_id,
         name, description, price, currency, stock_quantity, variants, images, delivery_info, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category_id = VALUES(category_id),
         subcategory_id = VALUES(subcategory_id),
         name = VALUES(name),
         description = VALUES(description),
         price = VALUES(price),
         currency = VALUES(currency),
         stock_quantity = VALUES(stock_quantity),
         variants = VALUES(variants),
         delivery_info = VALUES(delivery_info),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        entityId,
        ownerUserId,
        ownerRole,
        normalized.categoryId,
        normalized.subcategoryId,
        normalized.title,
        normalized.description || '',
        d.price ?? 0,
        d.currency,
        d.stockQuantity ?? 0,
        JSON.stringify(d.variants || {}),
        JSON.stringify([]),
        d.deliveryInfo,
        status,
      ]
    );
    return;
  }

  if (listingType === 'job') {
    await connection.query(
      `INSERT INTO jobs (
         id, employer_user_id, employer_role, category_id, title, description,
         employment_type, work_mode, location, salary_min, salary_max, currency,
         experience_required, education_required, skills, deadline, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category_id = VALUES(category_id),
         title = VALUES(title),
         description = VALUES(description),
         employment_type = VALUES(employment_type),
         work_mode = VALUES(work_mode),
         location = VALUES(location),
         salary_min = VALUES(salary_min),
         salary_max = VALUES(salary_max),
         currency = VALUES(currency),
         experience_required = VALUES(experience_required),
         education_required = VALUES(education_required),
         skills = VALUES(skills),
         deadline = VALUES(deadline),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        entityId,
        ownerUserId,
        ownerRole,
        normalized.categoryId,
        normalized.title,
        normalized.description || '',
        d.employmentType,
        d.workMode,
        d.location,
        d.salaryMin,
        d.salaryMax,
        d.currency,
        d.experienceRequired,
        d.educationRequired,
        JSON.stringify(d.skills || []),
        d.deadline,
        status,
      ]
    );
    return;
  }

  if (listingType === 'freelance_project') {
    await connection.query(
      `INSERT INTO freelance_projects (
         id, client_user_id, category_id, title, description, required_skills,
         budget, currency, deadline, deliverables, work_mode, location, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category_id = VALUES(category_id),
         title = VALUES(title),
         description = VALUES(description),
         required_skills = VALUES(required_skills),
         budget = VALUES(budget),
         currency = VALUES(currency),
         deadline = VALUES(deadline),
         deliverables = VALUES(deliverables),
         work_mode = VALUES(work_mode),
         location = VALUES(location),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        entityId,
        ownerUserId,
        normalized.categoryId,
        normalized.title,
        normalized.description || '',
        JSON.stringify(d.requiredSkills || []),
        d.budget,
        d.currency,
        d.deadline,
        d.deliverables,
        d.workMode,
        d.location,
        status,
      ]
    );
    return;
  }

  if (listingType === 'professional_profile') {
    const [existing] = await connection.query(
      'SELECT profile FROM professional_profiles WHERE user_id = ? LIMIT 1',
      [ownerUserId]
    );
    const current = parseJson(existing[0]?.profile, {});
    const mergedProfile = {
      ...current,
      fullName: normalized.title,
      ...(normalized.shortSummary ? { headline: normalized.shortSummary } : {}),
      ...(normalized.description ? { bio: normalized.description } : {}),
      ...(normalized.location?.city ? { city: normalized.location.city } : {}),
      ...(normalized.location?.state ? { state: normalized.location.state } : {}),
      ...(normalized.location?.country ? { country: normalized.location.country } : {}),
      ...d,
    };
    await connection.query(
      `INSERT INTO professional_profiles (user_id, listing_id, profile)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         listing_id = COALESCE(listing_id, VALUES(listing_id)),
         profile = VALUES(profile),
         updated_at = CURRENT_TIMESTAMP`,
      [ownerUserId, listingId, JSON.stringify(mergedProfile)]
    );
    return;
  }

  if (listingType === 'business_profile') {
    const [existing] = await connection.query(
      'SELECT profile, hiring_enabled FROM business_profiles WHERE user_id = ? LIMIT 1',
      [ownerUserId]
    );
    const current = parseJson(existing[0]?.profile, {});
    const hiringEnabled = d.hiringEnabled !== undefined
      ? Boolean(d.hiringEnabled)
      : Boolean(existing[0]?.hiring_enabled || current.hiringEnabled);
    const mergedProfile = {
      ...current,
      companyName: normalized.title,
      ...(normalized.shortSummary ? { shortDescription: normalized.shortSummary } : {}),
      ...(normalized.description ? { detailedDescription: normalized.description } : {}),
      ...(normalized.location?.city ? { city: normalized.location.city } : {}),
      ...(normalized.location?.state ? { state: normalized.location.state } : {}),
      ...(normalized.location?.country ? { country: normalized.location.country } : {}),
      ...d,
      hiringEnabled,
    };
    await connection.query(
      `INSERT INTO business_profiles (user_id, listing_id, hiring_enabled, profile)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         listing_id = COALESCE(listing_id, VALUES(listing_id)),
         hiring_enabled = VALUES(hiring_enabled),
         profile = VALUES(profile),
         updated_at = CURRENT_TIMESTAMP`,
      [ownerUserId, listingId, hiringEnabled, JSON.stringify(mergedProfile)]
    );
  }
}

async function syncTypeSpecificStatus(connection, listingType, entityId, status) {
  if (listingType === 'service') {
    await connection.query('UPDATE services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, entityId]);
  } else if (listingType === 'product') {
    await connection.query('UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, entityId]);
  } else if (listingType === 'job') {
    await connection.query('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, entityId]);
  } else if (listingType === 'freelance_project') {
    await connection.query('UPDATE freelance_projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, entityId]);
  }
}

function buildInputFromExisting(hydrated) {
  const d = hydrated.details || {};
  return {
    title: hydrated.title,
    shortSummary: hydrated.shortSummary,
    description: hydrated.description,
    categoryId: hydrated.categoryId,
    subcategoryId: hydrated.subcategoryId,
    location: hydrated.location,
    visibility: hydrated.visibility,
    ...d,
  };
}

export function registerUnifiedListingsRoutes(router, { pool, config, authenticate }) {
  // 1. Capabilities & policy discovery for authenticated user
  router.get('/listings/capabilities', authenticate, async (req, res, next) => {
    try {
      const [capabilities, policy] = await Promise.all([
        getUserCapabilities(pool, req.auth.userId),
        getModerationPolicy(pool, config),
      ]);
      return res.json({
        roles: capabilities.roles,
        isAdmin: capabilities.isAdmin,
        businessHiringEnabled: capabilities.businessHiringEnabled,
        allowedListingTypes: capabilities.allowedCreateTypes,
        moderationPolicy: policy,
      });
    } catch (error) {
      return next(error);
    }
  });

  // 2. Get own listings (paginated + status/type/search filters + status counts)
  router.get(['/listings/mine', '/my-listings'], authenticate, async (req, res, next) => {
    try {
      const { type, status, q, categoryId } = req.query;
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return sendError(res, 400, 'invalid_pagination', 'Page must be >= 1 and limit between 1 and 50.');
      }

      let canonicalType = null;
      if (type) {
        canonicalType = normalizeListingType(String(type));
        if (!canonicalType) {
          return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type filter.');
        }
      }
      if (status && !LISTING_STATUSES.includes(String(status))) {
        return sendError(res, 400, 'invalid_status', 'Unsupported status filter.');
      }

      const params = [req.auth.userId];
      let where = `WHERE ml.owner_user_id = ? AND ml.status != 'deleted'`;
      if (canonicalType) {
        where += ' AND ml.listing_type = ?';
        params.push(canonicalType);
      }
      if (status) {
        where += ' AND ml.status = ?';
        params.push(String(status));
      }
      if (categoryId) {
        where += ' AND ml.category_id = ?';
        params.push(String(categoryId));
      }
      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ' AND (ml.title LIKE ? OR ml.short_summary LIKE ? OR ml.description LIKE ?)';
        params.push(like, like, like);
      }

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM marketplace_listings ml ${where}`,
        params
      );
      const [statusCountRows] = await pool.query(
        `SELECT status, COUNT(*) AS total
           FROM marketplace_listings
          WHERE owner_user_id = ? AND status != 'deleted'
            ${canonicalType ? 'AND listing_type = ?' : ''}
          GROUP BY status`,
        canonicalType ? [req.auth.userId, canonicalType] : [req.auth.userId]
      );
      const counts = { all: 0 };
      for (const s of LISTING_STATUSES) counts[s] = 0;
      for (const row of statusCountRows) {
        counts[row.status] = Number(row.total || 0);
        counts.all += Number(row.total || 0);
      }

      const [rows] = await pool.query(
        `${UNIFIED_LISTING_SELECT} ${where}
          ORDER BY ml.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      );
      const listings = await hydrateUnifiedListings(pool, rows, config, { audience: 'owner' });
      const total = Number(countRows[0]?.total || 0);

      return res.json({
        listings,
        counts,
        pagination: {
          page,
          limit,
          total,
          hasMore: page * limit < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  // 3. Get one owned listing
  router.get('/listings/mine/:id', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only access your own listings.');
      }
      const listing = await fetchHydratedListing(pool, config, req.params.id, { audience: 'owner' });
      return res.json({ listing });
    } catch (error) {
      return next(error);
    }
  });

  // 4. Preview unsaved payload (exact customer-facing structure)
  router.post('/listings/preview', authenticate, async (req, res, next) => {
    try {
      const body = req.body || {};
      const canonicalType = normalizeListingType(body.listingType || body.type);
      if (!canonicalType) {
        return sendError(res, 400, 'invalid_listing_type', 'Choose a supported listing type.');
      }
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      const roleCheck = resolveOwnerRoleForType(capabilities, canonicalType, body.ownerRole || body.providerRole);
      if (!roleCheck.ok) {
        return sendError(res, roleCheck.status, roleCheck.code, roleCheck.message);
      }
      const normalized = normalizeUnifiedListingInput(canonicalType, body, { isDraft: true });
      if (normalized.error) {
        return sendError(res, 400, 'validation_error', normalized.error);
      }
      const val = normalized.value;
      const [users] = await pool.query('SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth.userId]);
      const [urRows] = await pool.query(
        'SELECT verification_status FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1',
        [req.auth.userId, roleCheck.ownerRole]
      );

      let categoryName = null;
      let subcategoryName = null;
      if (val.categoryId) {
        const [cats] = await pool.query(
          `SELECT name FROM categories WHERE id = ? UNION SELECT name FROM service_categories WHERE id = ? LIMIT 1`,
          [val.categoryId, val.categoryId]
        );
        categoryName = cats[0]?.name || null;
      }
      if (val.subcategoryId) {
        const [subs] = await pool.query(
          `SELECT name FROM categories WHERE id = ? UNION SELECT name FROM service_subcategories WHERE id = ? LIMIT 1`,
          [val.subcategoryId, val.subcategoryId]
        );
        subcategoryName = subs[0]?.name || null;
      }

      const publicMedia = Array.isArray(body.media)
        ? body.media.filter((item) => item && item.visibility !== 'private')
        : [];

      return res.json({
        preview: {
          id: body.id || 'preview',
          entityId: body.id || 'preview',
          listingType: canonicalType,
          title: val.title,
          shortSummary: val.shortSummary,
          description: val.description,
          categoryId: val.categoryId,
          categoryName,
          subcategoryId: val.subcategoryId,
          subcategoryName,
          location: val.location,
          visibility: val.visibility,
          status: 'published',
          isPublic: true,
          owner: {
            userId: req.auth.userId,
            role: roleCheck.ownerRole,
            displayName: users[0]?.name || null,
            businessName: null,
            verified: urRows[0]?.verification_status === 'verified',
          },
          coverImage: publicMedia.find((m) => m.isCover) || publicMedia[0] || null,
          media: publicMedia,
          details: val.details,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  // 5. Create listing (supports /listings and /listings/draft)
  const createUnifiedListing = (forcedDraft = false) => async (req, res, next) => {
    try {
      const body = req.body || {};
      const requestedType = body.listingType || body.type;
      const canonicalType = normalizeListingType(requestedType);
      if (!canonicalType) {
        return sendError(res, 400, 'invalid_listing_type', 'Choose a supported listing type.');
      }
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      const roleCheck = resolveOwnerRoleForType(
        capabilities,
        canonicalType,
        body.ownerRole || body.providerRole || null
      );
      if (!roleCheck.ok) {
        return sendError(res, roleCheck.status, roleCheck.code, roleCheck.message);
      }

      const policy = await getModerationPolicy(pool, config);
      const desiredStatus = forcedDraft ? 'draft' : (body.status || 'draft');
      if (!['draft', 'pending_review', 'published'].includes(desiredStatus)) {
        return sendError(res, 400, 'invalid_status', 'New listings can only start as draft, pending_review, or published.');
      }

      const isDraft = desiredStatus === 'draft';
      if (desiredStatus === 'published' && requiresReviewForType(policy, canonicalType)) {
        return sendError(
          res,
          409,
          'review_required',
          'This listing type requires review approval before publishing. Submit it for review instead.'
        );
      }

      const normalized = normalizeUnifiedListingInput(canonicalType, body, { isDraft });
      if (normalized.error) {
        return sendError(res, 400, 'validation_error', normalized.error);
      }
      const val = normalized.value;

      const requireCategory = !isDraft && !['professional_profile', 'business_profile'].includes(canonicalType);
      const categoryRes = await validateAndResolveCategory(
        pool,
        canonicalType,
        val.categoryId,
        val.subcategoryId,
        { required: requireCategory }
      );
      if (!categoryRes.ok) {
        return sendError(res, 400, 'invalid_category', categoryRes.message);
      }
      val.categoryId = categoryRes.categoryId;
      val.subcategoryId = categoryRes.subcategoryId;
      const serviceRuleError = await validateServiceRules(pool, val, { requireComplete: !isDraft });
      if (serviceRuleError) {
        return sendError(res, 400, serviceRuleError.code, serviceRuleError.message);
      }

      const mediaItems = Array.isArray(body.media) ? body.media : [];
      if (mediaItems.length > 12) {
        return sendError(res, 400, 'invalid_media', 'A listing can have at most 12 media items.');
      }

      // Profile listings keep 1:1 per user_id + role
      let listingId = randomUUID();
      let entityId = listingId;
      if (canonicalType === 'professional_profile' || canonicalType === 'business_profile') {
        const table = canonicalType === 'professional_profile' ? 'professional_profiles' : 'business_profiles';
        const [profileRows] = await pool.query(
          `SELECT user_id, listing_id FROM ${table} WHERE user_id = ? LIMIT 1`,
          [req.auth.userId]
        );
        entityId = req.auth.userId;
        if (profileRows[0]?.listing_id) {
          listingId = profileRows[0].listing_id;
        } else {
          const [collision] = await pool.query(
            'SELECT id, listing_type FROM marketplace_listings WHERE id = ? LIMIT 1',
            [req.auth.userId]
          );
          if (!collision.length || collision[0].listing_type === canonicalType) {
            listingId = req.auth.userId;
          }
        }
      }

      const createdListing = await withTransaction(pool, async (connection) => {
        await persistTypeSpecificEntity(connection, {
          listingId,
          entityId,
          listingType: canonicalType,
          ownerUserId: req.auth.userId,
          ownerRole: roleCheck.ownerRole,
          normalized: val,
          status: desiredStatus,
        });

        await syncMarketplaceListing(connection, {
          id: listingId,
          entityId,
          type: canonicalType,
          ownerId: req.auth.userId,
          ownerRole: roleCheck.ownerRole,
          categoryId: val.categoryId,
          subcategoryId: val.subcategoryId,
          title: val.title,
          shortSummary: val.shortSummary,
          description: val.description,
          location: val.location,
          visibility: val.visibility,
          status: desiredStatus,
          moderationStatus: desiredStatus === 'pending_review' ? 'pending' : 'not_required',
          submittedForReviewAt: desiredStatus === 'pending_review' ? new Date() : null,
          publishedAt: desiredStatus === 'published' ? new Date() : null,
        });

        await recordStatusHistory(connection, {
          listingId,
          listingType: canonicalType,
          fromStatus: null,
          toStatus: desiredStatus,
          userId: req.auth.userId,
          role: roleCheck.ownerRole,
          reason: desiredStatus === 'pending_review' ? 'Submitted for review on creation' : 'Listing created',
        });

        for (const [index, item] of mediaItems.entries()) {
          const assetId = typeof item === 'string' ? item : item?.mediaAssetId;
          if (!assetId) continue;
          const attachRes = await attachMediaToListing(connection, {
            listingId,
            listingType: canonicalType,
            ownerUserId: req.auth.userId,
            mediaAssetId: assetId,
            mediaType: item?.mediaType || null,
            isCover: Boolean(item?.isCover),
            altText: item?.altText || null,
            displayOrder: item?.displayOrder ?? index,
            visibility: item?.visibility || null,
          });
          if (attachRes.error) {
            const err = new Error(attachRes.error.message);
            err.httpStatus = attachRes.error.status;
            err.httpCode = attachRes.error.code;
            throw err;
          }
        }

        return listingId;
      });

      const listing = await fetchHydratedListing(pool, config, createdListing, { audience: 'owner' });
      return res.status(201).json({ listing });
    } catch (error) {
      if (error.httpStatus) {
        return sendError(res, error.httpStatus, error.httpCode, error.message);
      }
      return next(error);
    }
  };

  router.post('/listings/draft', authenticate, createUnifiedListing(true));
  router.post('/listings', authenticate, createUnifiedListing(false));

  // 6. Update listing / save draft
  const updateUnifiedListing = (forcedDraft = false) => async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only manage your own listings.');
      }
      if (existing.status === 'archived') {
        return sendError(res, 409, 'listing_archived', 'Archived listings cannot be edited.');
      }

      const canonicalType = normalizeListingType(existing.listing_type);
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      const roleCheck = resolveOwnerRoleForType(capabilities, canonicalType, existing.owner_role);
      if (!roleCheck.ok) {
        return sendError(res, roleCheck.status, roleCheck.code, roleCheck.message);
      }

      const currentHydrated = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      const mergedInput = {
        ...buildInputFromExisting(currentHydrated),
        ...(req.body || {}),
      };
      delete mergedInput.status;

      const requestedStatus = forcedDraft
        ? 'draft'
        : req.body?.status !== undefined
          ? req.body.status
          : existing.status;

      const policy = await getModerationPolicy(pool, config);
      if (requestedStatus !== existing.status) {
        const transition = validateOwnerTransition({
          fromStatus: existing.status,
          toStatus: requestedStatus,
          listingType: canonicalType,
          moderationPolicy: policy,
          moderationStatus: existing.moderation_status,
        });
        if (!transition.ok) {
          return sendError(res, transition.status, transition.code, transition.message);
        }
      }

      const isDraft = requestedStatus === 'draft';
      const normalized = normalizeUnifiedListingInput(canonicalType, mergedInput, { isDraft });
      if (normalized.error) {
        return sendError(res, 400, 'validation_error', normalized.error);
      }
      const val = normalized.value;

      const requireCategory = !isDraft && !['professional_profile', 'business_profile'].includes(canonicalType);
      const categoryRes = await validateAndResolveCategory(
        pool,
        canonicalType,
        val.categoryId,
        val.subcategoryId,
        { required: requireCategory }
      );
      if (!categoryRes.ok) {
        return sendError(res, 400, 'invalid_category', categoryRes.message);
      }
      val.categoryId = categoryRes.categoryId;
      val.subcategoryId = categoryRes.subcategoryId;
      const serviceRuleError = await validateServiceRules(pool, val, { requireComplete: !isDraft });
      if (serviceRuleError) {
        return sendError(res, 400, serviceRuleError.code, serviceRuleError.message);
      }

      await withTransaction(pool, async (connection) => {
        await persistTypeSpecificEntity(connection, {
          listingId: existing.id,
          entityId: existing.entity_id || existing.id,
          listingType: canonicalType,
          ownerUserId: req.auth.userId,
          ownerRole: existing.owner_role,
          normalized: val,
          status: requestedStatus,
        });

        await syncMarketplaceListing(connection, {
          id: existing.id,
          entityId: existing.entity_id || existing.id,
          type: canonicalType,
          ownerId: req.auth.userId,
          ownerRole: existing.owner_role,
          categoryId: val.categoryId,
          subcategoryId: val.subcategoryId,
          title: val.title,
          shortSummary: val.shortSummary,
          description: val.description,
          location: val.location,
          visibility: val.visibility,
          status: requestedStatus,
          moderationStatus: requestedStatus === 'pending_review' ? 'pending' : existing.moderation_status,
          submittedForReviewAt: requestedStatus === 'pending_review' ? new Date() : existing.submitted_for_review_at,
          publishedAt: requestedStatus === 'published' ? (existing.published_at || new Date()) : existing.published_at,
        });

        if (requestedStatus !== existing.status) {
          await recordStatusHistory(connection, {
            listingId: existing.id,
            listingType: canonicalType,
            fromStatus: existing.status,
            toStatus: requestedStatus,
            userId: req.auth.userId,
            role: existing.owner_role,
            reason: forcedDraft ? 'Saved as draft' : 'Updated listing status',
          });
        }
      });

      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      return res.json({ listing });
    } catch (error) {
      return next(error);
    }
  };

  router.patch('/listings/:id/draft', authenticate, updateUnifiedListing(true));
  router.put('/listings/:id', authenticate, updateUnifiedListing(false));
  router.patch('/listings/:id', authenticate, updateUnifiedListing(false));

  // 7. Lifecycle transition endpoints (submit-review, publish, pause, resume, archive)
  const handleLifecycleAction = (targetStatus, defaultReason, { validateCompleteness = false } = {}) => async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only manage your own listings.');
      }
      const canonicalType = normalizeListingType(existing.listing_type);
      const policy = await getModerationPolicy(pool, config);
      const transition = validateOwnerTransition({
        fromStatus: existing.status,
        toStatus: targetStatus,
        listingType: canonicalType,
        moderationPolicy: policy,
        moderationStatus: existing.moderation_status,
      });
      if (!transition.ok) {
        return sendError(res, transition.status, transition.code, transition.message);
      }

      const currentHydrated = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      if (validateCompleteness) {
        const normalized = normalizeUnifiedListingInput(canonicalType, buildInputFromExisting(currentHydrated), { isDraft: false });
        if (normalized.error) {
          return sendError(res, 400, 'validation_error', normalized.error);
        }
        const requireCategory = !['professional_profile', 'business_profile'].includes(canonicalType);
        const categoryRes = await validateAndResolveCategory(
          pool,
          canonicalType,
          existing.category_id,
          existing.subcategory_id,
          { required: requireCategory }
        );
        if (!categoryRes.ok) {
          return sendError(res, 400, 'invalid_category', categoryRes.message);
        }
        const serviceRuleError = await validateServiceRules(pool, normalized.value, {
          requireComplete: true,
        });
        if (serviceRuleError) {
          return sendError(res, 400, serviceRuleError.code, serviceRuleError.message);
        }
      }

      await withTransaction(pool, async (connection) => {
        await syncTypeSpecificStatus(connection, canonicalType, existing.entity_id || existing.id, targetStatus);
        await connection.query(
          `UPDATE marketplace_listings
              SET status = ?,
                  is_public = (? = 'published' AND visibility = 'public'),
                  published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,
                  archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE archived_at END,
                  submitted_for_review_at = CASE WHEN ? = 'pending_review' THEN CURRENT_TIMESTAMP ELSE submitted_for_review_at END,
                  moderation_status = CASE WHEN ? = 'pending_review' THEN 'pending' ELSE moderation_status END,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [targetStatus, targetStatus, targetStatus, targetStatus, targetStatus, targetStatus, existing.id]
        );
        await recordStatusHistory(connection, {
          listingId: existing.id,
          listingType: canonicalType,
          fromStatus: existing.status,
          toStatus: targetStatus,
          userId: req.auth.userId,
          role: existing.owner_role,
          reason: typeof req.body?.reason === 'string' && req.body.reason.trim()
            ? req.body.reason.trim()
            : defaultReason,
        });
      });

      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      return res.json({ listing });
    } catch (error) {
      return next(error);
    }
  };

  router.post('/listings/:id/submit-review', authenticate, handleLifecycleAction('pending_review', 'Submitted for review', { validateCompleteness: true }));
  router.post('/listings/:id/publish', authenticate, handleLifecycleAction('published', 'Published by owner', { validateCompleteness: true }));
  router.post('/listings/:id/pause', authenticate, handleLifecycleAction('paused', 'Paused by owner'));
  router.post('/listings/:id/resume', authenticate, handleLifecycleAction('published', 'Resumed by owner', { validateCompleteness: true }));
  router.post('/listings/:id/archive', authenticate, handleLifecycleAction('archived', 'Archived by owner'));
  router.delete('/listings/:id', authenticate, handleLifecycleAction('archived', 'Archived by owner'));

  // 8. Status history & saved-listing Preview
  router.get('/listings/:id/history', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      if (existing.owner_user_id !== req.auth.userId && !capabilities.isAdmin) {
        return sendError(res, 403, 'forbidden', 'You can only view status history for your own listings.');
      }
      const [history] = await pool.query(
        `SELECT id, listing_id AS listingId, listing_type AS listingType,
                from_status AS fromStatus, to_status AS toStatus,
                changed_by_user_id AS changedByUserId, changed_by_role AS changedByRole,
                reason, created_at AS createdAt
           FROM listing_status_history
          WHERE listing_id = ?
          ORDER BY created_at DESC`,
        [existing.id]
      );
      return res.json({ history });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/listings/:id/preview', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      if (existing.owner_user_id !== req.auth.userId && !capabilities.isAdmin) {
        return sendError(res, 403, 'forbidden', 'You can only preview your own listings.');
      }
      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'preview' });
      return res.json({ preview: listing });
    } catch (error) {
      return next(error);
    }
  });

  // 9. Unified listing media attach / reorder / remove
  router.post('/listings/:id/media', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only manage media on your own listings.');
      }
      const body = req.body || {};
      if (typeof body.mediaAssetId !== 'string' || !body.mediaAssetId.trim()) {
        return sendError(res, 400, 'invalid_media', 'A valid mediaAssetId is required.');
      }
      const result = await withTransaction(pool, (connection) => attachMediaToListing(connection, {
        listingId: existing.id,
        listingType: existing.listing_type,
        ownerUserId: req.auth.userId,
        mediaAssetId: body.mediaAssetId.trim(),
        mediaType: body.mediaType || null,
        isCover: Boolean(body.isCover),
        altText: body.altText || null,
        displayOrder: body.displayOrder,
        visibility: body.visibility || null,
      }));
      if (result.error) {
        return sendError(res, result.error.status, result.error.code, result.error.message);
      }
      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      return res.status(201).json({ media: result.media, listing });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendError(res, 409, 'media_already_attached', 'This media asset is already attached to this listing.');
      }
      return next(error);
    }
  });

  router.patch('/listings/:id/media/reorder', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only reorder media on your own listings.');
      }
      const body = req.body || {};
      await withTransaction(pool, (connection) => reorderListingMedia(connection, {
        listingId: existing.id,
        items: body.items,
        order: body.order,
        coverMediaId: body.coverMediaId,
      }));
      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      return res.json({ media: listing.media, listing });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/listings/:id/media/:mediaId', authenticate, async (req, res, next) => {
    try {
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      if (existing.owner_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden', 'You can only remove media from your own listings.');
      }
      const result = await withTransaction(pool, (connection) => detachMediaFromListing(connection, config, {
        listingId: existing.id,
        mediaId: req.params.mediaId,
        ownerUserId: req.auth.userId,
      }));
      if (result.error) {
        return sendError(res, result.error.status, result.error.code, result.error.message);
      }
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  // 10. Admin moderation routes
  router.get('/admin/listings/pending', authenticate, async (req, res, next) => {
    try {
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      if (!capabilities.isAdmin) {
        return sendError(res, 403, 'forbidden_role', 'Only authorized administrators can review listings.');
      }
      const [rows] = await pool.query(
        `${UNIFIED_LISTING_SELECT}
          WHERE ml.status = 'pending_review'
          ORDER BY COALESCE(ml.submitted_for_review_at, ml.updated_at) ASC
          LIMIT 50`
      );
      const listings = await hydrateUnifiedListings(pool, rows, config, { audience: 'owner' });
      return res.json({ listings });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/listings/:id/moderate', authenticate, async (req, res, next) => {
    try {
      const capabilities = await getUserCapabilities(pool, req.auth.userId);
      if (!capabilities.isAdmin) {
        return sendError(res, 403, 'forbidden_role', 'Only authorized administrators can moderate listings.');
      }
      const existing = await fetchListingRow(pool, req.params.id);
      if (!existing || existing.status === 'deleted') {
        return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
      }
      const { action, reason } = req.body || {};
      const decision = validateAdminModeration({
        fromStatus: existing.status,
        action,
        reason,
      });
      if (!decision.ok) {
        return sendError(res, decision.status, decision.code, decision.message);
      }

      const canonicalType = normalizeListingType(existing.listing_type);
      await withTransaction(pool, async (connection) => {
        await syncTypeSpecificStatus(connection, canonicalType, existing.entity_id || existing.id, decision.toStatus);
        await connection.query(
          `UPDATE marketplace_listings
              SET status = ?,
                  is_public = (? = 'published' AND visibility = 'public'),
                  published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END,
                  archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE archived_at END,
                  moderation_status = COALESCE(?, moderation_status),
                  moderation_reason = ?,
                  moderated_by = ?,
                  moderated_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            decision.toStatus,
            decision.toStatus,
            decision.toStatus,
            decision.toStatus,
            decision.moderationStatus,
            decision.reason,
            req.auth.userId,
            existing.id,
          ]
        );
        await recordStatusHistory(connection, {
          listingId: existing.id,
          listingType: canonicalType,
          fromStatus: existing.status,
          toStatus: decision.toStatus,
          userId: req.auth.userId,
          role: 'admin',
          reason: decision.reason || `Moderated: ${action}`,
        });
      });

      const listing = await fetchHydratedListing(pool, config, existing.id, { audience: 'owner' });
      return res.json({ listing });
    } catch (error) {
      return next(error);
    }
  });

  // 11. Public Customer Discovery Contract (eligible published records only, section-isolated)
  const discoverPublicListings = (forcedType = null) => async (req, res, next) => {
    try {
      const {
        q,
        type,
        categoryId,
        subcategoryId,
        location,
        category,
        skill,
        minExperience,
        maxExperience,
        minBudget,
        maxBudget,
        deadline,
        workMode,
        sort = 'newest',
      } = req.query;
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return sendError(res, 400, 'invalid_pagination', 'Page must be >= 1 and limit between 1 and 50.');
      }

      const rawType = forcedType || type;
      let canonicalType = null;
      if (rawType) {
        canonicalType = normalizeListingType(String(rawType));
        if (!canonicalType || !CANONICAL_LISTING_TYPES.includes(canonicalType)) {
          return sendError(res, 400, 'invalid_listing_type', 'Unsupported listing type.');
        }
      }

      const minExperienceNum = minExperience === undefined || minExperience === '' ? null : Number(minExperience);
      const maxExperienceNum = maxExperience === undefined || maxExperience === '' ? null : Number(maxExperience);
      const minBudgetNum = minBudget === undefined || minBudget === '' ? null : Number(minBudget);
      const maxBudgetNum = maxBudget === undefined || maxBudget === '' ? null : Number(maxBudget);
      if ((minExperienceNum !== null && (!Number.isFinite(minExperienceNum) || minExperienceNum < 0)) ||
          (maxExperienceNum !== null && (!Number.isFinite(maxExperienceNum) || maxExperienceNum < 0)) ||
          (minExperienceNum !== null && maxExperienceNum !== null && minExperienceNum > maxExperienceNum) ||
          (minBudgetNum !== null && (!Number.isFinite(minBudgetNum) || minBudgetNum < 0)) ||
          (maxBudgetNum !== null && (!Number.isFinite(maxBudgetNum) || maxBudgetNum < 0)) ||
          (minBudgetNum !== null && maxBudgetNum !== null && minBudgetNum > maxBudgetNum)) {
        return sendError(res, 400, 'invalid_filter', 'Enter valid, non-negative filter ranges.');
      }
      if (((skill || category) && ![
        'professional_profile',
        'business_profile',
        'job',
        'freelance_project',
      ].includes(canonicalType)) ||
          ((minExperienceNum !== null || maxExperienceNum !== null) && canonicalType !== 'professional_profile') ||
          ((minBudgetNum !== null || maxBudgetNum !== null || deadline) && canonicalType !== 'freelance_project') ||
          (workMode && !['job', 'freelance_project'].includes(canonicalType))) {
        return sendError(res, 400, 'invalid_filter', 'One or more filters do not apply to this discovery section.');
      }
      const validSorts = canonicalType === 'professional_profile'
        ? ['newest', 'oldest', 'experience_desc']
        : ['newest', 'oldest'];
      if (!validSorts.includes(String(sort))) {
        return sendError(res, 400, 'invalid_sort', 'The selected sort order is not supported for this section.');
      }

      const params = [];
      let where = `WHERE ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'`;
      if (canonicalType) {
        where += ' AND ml.listing_type = ?';
        params.push(canonicalType);
      }
      if (categoryId) {
        where += ' AND ml.category_id = ?';
        params.push(String(categoryId));
      }
      if (subcategoryId) {
        where += ' AND ml.subcategory_id = ?';
        params.push(String(subcategoryId));
      }
      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ' AND (ml.title LIKE ? OR ml.short_summary LIKE ? OR ml.description LIKE ?)';
        params.push(like, like, like);
      }
      if (location && String(location).trim()) {
        const like = `%${String(location).trim()}%`;
        where += ' AND CAST(ml.location AS CHAR) LIKE ?';
        params.push(like);
      }

      if (category && canonicalType === 'professional_profile') {
        where += ` AND EXISTS (
          SELECT 1 FROM professional_profiles pp
           WHERE pp.listing_id = ml.id
             AND JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) LIKE ?
        )`;
        params.push(`%${String(category).trim()}%`);
      } else if (category && canonicalType === 'business_profile') {
        const categoryText = String(category).trim();
        where += ` AND EXISTS (
          SELECT 1
            FROM business_profiles bp
            LEFT JOIN business_categories bc ON bc.business_user_id = bp.user_id
            LEFT JOIN categories c ON c.id = bc.category_id
           WHERE bp.listing_id = ml.id
             AND (
               JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.industry')) LIKE ?
               OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.businessType')) LIKE ?
               OR c.id = ?
               OR c.name LIKE ?
             )
        )`;
        params.push(`%${categoryText}%`, `%${categoryText}%`, categoryText, `%${categoryText}%`);
      } else if (category && canonicalType === 'job') {
        const categoryText = String(category).trim();
        where += ` AND EXISTS (
          SELECT 1 FROM jobs j
          LEFT JOIN categories c ON c.id = j.category_id
          WHERE j.listing_id = ml.id AND (c.id = ? OR c.name LIKE ?)
        )`;
        params.push(categoryText, `%${categoryText}%`);
      } else if (category && canonicalType === 'freelance_project') {
        const categoryText = String(category).trim();
        where += ` AND EXISTS (
          SELECT 1 FROM freelance_projects p
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.listing_id = ml.id AND (c.id = ? OR c.name LIKE ?)
        )`;
        params.push(categoryText, `%${categoryText}%`);
      }
      if (skill && String(skill).trim()) {
        const skillLike = `%${String(skill).trim()}%`;
        if (canonicalType === 'professional_profile') {
          where += ` AND EXISTS (
            SELECT 1
              FROM professional_profiles pp
             WHERE pp.listing_id = ml.id AND (
               EXISTS (SELECT 1 FROM professional_skills ps
                        WHERE ps.professional_user_id = pp.user_id AND ps.skill LIKE ?)
               OR JSON_SEARCH(pp.profile, 'one', ?, NULL, '$.skills[*]') IS NOT NULL
             )
          )`;
          params.push(skillLike, skillLike);
        } else if (canonicalType === 'job') {
          where += ` AND EXISTS (
            SELECT 1 FROM jobs j JOIN job_skills js ON js.job_id = j.id
            WHERE j.listing_id = ml.id AND js.skill LIKE ?
          )`;
          params.push(skillLike);
        } else {
          where += ` AND EXISTS (
            SELECT 1 FROM freelance_projects p JOIN project_skills ps ON ps.project_id = p.id
            WHERE p.listing_id = ml.id AND ps.skill LIKE ?
          )`;
          params.push(skillLike);
        }
      }
      if (minExperienceNum !== null) {
        where += ` AND EXISTS (
          SELECT 1 FROM professional_profiles pp
           WHERE pp.listing_id = ml.id
             AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) >= ?
        )`;
        params.push(minExperienceNum);
      }
      if (maxExperienceNum !== null) {
        where += ` AND EXISTS (
          SELECT 1 FROM professional_profiles pp
           WHERE pp.listing_id = ml.id
             AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) <= ?
        )`;
        params.push(maxExperienceNum);
      }
      if (minBudgetNum !== null) {
        where += ` AND EXISTS (
          SELECT 1 FROM freelance_projects p
          WHERE p.listing_id = ml.id
            AND COALESCE(p.budget_max, p.budget, 0) >= ?
        )`;
        params.push(minBudgetNum);
      }
      if (maxBudgetNum !== null) {
        where += ` AND EXISTS (
          SELECT 1 FROM freelance_projects p
          WHERE p.listing_id = ml.id
            AND COALESCE(p.budget_min, p.budget, 0) <= ?
        )`;
        params.push(maxBudgetNum);
      }
      if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))) {
        return sendError(res, 400, 'invalid_filter', 'Deadline must use YYYY-MM-DD format.');
      }
      if (deadline) {
        const deadlineValue = String(deadline);
        const parsedDeadline = new Date(`${deadlineValue}T00:00:00.000Z`);
        if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.toISOString().slice(0, 10) !== deadlineValue) {
          return sendError(res, 400, 'invalid_filter', 'Deadline must be a valid calendar date.');
        }
        where += ` AND EXISTS (
          SELECT 1 FROM freelance_projects p
          WHERE p.listing_id = ml.id AND p.deadline <= ?
        )`;
        params.push(deadlineValue);
      }
      if (workMode) {
        if (!['remote', 'on-site', 'hybrid'].includes(String(workMode))) {
          return sendError(res, 400, 'invalid_filter', 'Choose remote, on-site, or hybrid work mode.');
        }
        if (canonicalType === 'job') {
          where += ` AND EXISTS (SELECT 1 FROM jobs j WHERE j.listing_id = ml.id AND j.work_mode = ?)`;
        } else {
          where += ` AND EXISTS (SELECT 1 FROM freelance_projects p WHERE p.listing_id = ml.id AND p.work_mode = ?)`;
        }
        params.push(String(workMode));
      }

      const orderBy = sort === 'oldest'
        ? 'ORDER BY COALESCE(ml.published_at, ml.created_at) ASC'
        : sort === 'experience_desc'
          ? `ORDER BY (
              SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2))
                FROM professional_profiles pp WHERE pp.listing_id = ml.id LIMIT 1
            ) DESC, COALESCE(ml.published_at, ml.created_at) DESC`
          : 'ORDER BY COALESCE(ml.published_at, ml.created_at) DESC';

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM marketplace_listings ml ${where}`,
        params
      );
      const [rows] = await pool.query(
        `${UNIFIED_LISTING_SELECT} ${where} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
      );
      const listings = await hydrateUnifiedListings(pool, rows, config, { audience: 'public' });
      const total = Number(countRows[0]?.total || 0);

      return res.json({
        listings,
        pagination: {
          page,
          limit,
          total,
          hasMore: page * limit < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  };

  router.get('/listings/sections/:type', (req, res, next) => discoverPublicListings(req.params.type)(req, res, next));
  router.get('/listings', discoverPublicListings(null));

  router.get('/listings/:id', async (req, res, next) => {
    try {
      const listing = await fetchHydratedListing(pool, config, req.params.id, {
        audience: 'public',
        publicOnly: true,
      });
      if (!listing) {
        return sendError(res, 404, 'listing_not_found', 'Published listing was not found.');
      }
      return res.json({ listing });
    } catch (error) {
      return next(error);
    }
  });
}

