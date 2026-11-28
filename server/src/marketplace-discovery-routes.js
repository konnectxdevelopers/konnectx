import { randomUUID } from 'node:crypto';
import { syncMarketplaceListing } from './marketplace-listings.js';
import { getModerationPolicy, requiresReviewForType } from './listing-engine.js';

const DISCOVERY_SECTIONS = [
  { key: 'services', label: 'Services', icon: 'wrench-outline' },
  { key: 'products', label: 'Shopping & Products', icon: 'shopping-outline' },
  { key: 'professionals', label: 'Professionals & Freelancers', icon: 'account-tie-outline' },
  { key: 'jobs', label: 'Jobs & Employment', icon: 'briefcase-outline' },
  { key: 'projects', label: 'Freelance Projects', icon: 'rocket-launch-outline' },
  { key: 'businesses', label: 'Businesses & Shops', icon: 'storefront-outline' },
];

function sendError(res, status, code, message) {
  return res.status(status).json({ code, message });
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

async function inTransaction(pool, callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function categoryIsValid(pool, categoryId, subcategoryId, listingType) {
  const [categories] = await pool.query(
    `SELECT c.id FROM categories c
      LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE c.id = ? AND c.is_active = TRUE
       AND (c.listing_type = ? OR parent.listing_type = ?) LIMIT 1`,
    [categoryId, listingType, listingType]
  );
  if (!categories.length) return false;
  if (!subcategoryId) return true;
  const [subcategories] = await pool.query(
    'SELECT id FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
    [subcategoryId, categoryId]
  );
  return subcategories.length > 0;
}

async function legacyPublishRequiresReview(pool, config, listingType, requestedStatus) {
  if (requestedStatus !== 'published') return false;
  const policy = await getModerationPolicy(pool, config);
  return requiresReviewForType(policy, listingType);
}

export function registerMarketplaceDiscoveryRoutes(router, { pool, authenticate, config }) {
  router.get('/marketplace/sections', (_req, res) => {
    return res.json({ sections: DISCOVERY_SECTIONS });
  });

  // Jobs (Hiring or Business)
  router.get('/marketplace/jobs', async (req, res, next) => {
    try {
      const { q, categoryId, employmentType, workMode, location, limit = '20', page = '1' } = req.query;
      const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
      const offset = (Math.max(1, Number(page) || 1) - 1) * limitNum;
      const params = [];
      let where = `WHERE j.status = 'published'
        AND EXISTS (
          SELECT 1 FROM marketplace_listings ml
           WHERE ml.id = j.id AND ml.listing_type = 'job'
             AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
        )`;
      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (j.title LIKE ? OR j.description LIKE ?)`;
        params.push(like, like);
      }
      if (categoryId) {
        where += ` AND j.category_id = ?`;
        params.push(categoryId);
      }
      if (employmentType) {
        where += ` AND j.employment_type = ?`;
        params.push(employmentType);
      }
      if (workMode) {
        where += ` AND j.work_mode = ?`;
        params.push(workMode);
      }
      if (location) {
        where += ` AND j.location LIKE ?`;
        params.push(`%${String(location).trim()}%`);
      }
      const [rows] = await pool.query(
        `SELECT j.*, u.name AS employer_name FROM jobs j
         LEFT JOIN users u ON u.id = j.employer_user_id
         ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      return res.json({
        jobs: rows.map((r) => ({
          id: r.id,
          employerUserId: r.employer_user_id,
          employerName: r.employer_name || null,
          categoryId: r.category_id || null,
          title: r.title,
          description: r.description,
          employmentType: r.employment_type,
          workMode: r.work_mode,
          location: r.location || null,
          salaryMin: r.salary_min ? Number(r.salary_min) : null,
          salaryMax: r.salary_max ? Number(r.salary_max) : null,
          currency: r.currency || 'INR',
          skills: parseJson(r.skills, []),
          status: r.status,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/jobs', authenticate, async (req, res, next) => {
    try {
      const [roleRows] = await pool.query(
        `SELECT role FROM user_roles WHERE user_id = ? AND role IN ('hiring', 'business')`,
        [req.auth.userId]
      );
      if (!roleRows.length) {
        return res.status(403).json({ code: 'forbidden_role', message: 'Only hiring or business accounts can post jobs.' });
      }
      const roleSet = new Set(roleRows.map((row) => row.role));
      let employerRole = roleSet.has('hiring') ? 'hiring' : 'business';
      if (req.body?.employerRole === 'business' || !roleSet.has('hiring')) {
        if (!roleSet.has('business')) {
          return res.status(403).json({ code: 'forbidden_role', message: 'Your account does not hold the business role.' });
        }
        const [bpRows] = await pool.query(
          'SELECT hiring_enabled, profile FROM business_profiles WHERE user_id = ? LIMIT 1',
          [req.auth.userId]
        );
        const bpProfile = parseJson(bpRows[0]?.profile, {});
        if (!bpRows[0] || (!bpRows[0].hiring_enabled && !bpProfile.hiringEnabled)) {
          return res.status(403).json({
            code: 'hiring_capability_disabled',
            message: 'Enable business hiring capability before posting jobs as a business.',
          });
        }
        employerRole = 'business';
      }
      const body = req.body || {};
      if (!body.title || !body.description) {
        return res.status(400).json({ code: 'validation_error', message: 'Job title and description are required.' });
      }
      if (!body.categoryId || !(await categoryIsValid(pool, body.categoryId, null, 'job'))) {
        return res.status(400).json({ code: 'invalid_category', message: 'Select a valid job category.' });
      }
      const employmentTypes = new Set(['full-time', 'part-time', 'contract', 'temporary', 'internship']);
      const workModes = new Set(['on-site', 'remote', 'hybrid']);
      const employmentType = body.employmentType || 'full-time';
      const workMode = body.workMode || 'on-site';
      const salaryMin = body.salaryMin === '' || body.salaryMin === undefined ? null : Number(body.salaryMin);
      const salaryMax = body.salaryMax === '' || body.salaryMax === undefined ? null : Number(body.salaryMax);
      if (!employmentTypes.has(employmentType) || !workModes.has(workMode) ||
          (salaryMin !== null && (!Number.isFinite(salaryMin) || salaryMin < 0)) ||
          (salaryMax !== null && (!Number.isFinite(salaryMax) || salaryMax < 0)) ||
          (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax)) {
        return res.status(400).json({ code: 'validation_error', message: 'Employment, work mode, or salary range is invalid.' });
      }
      const id = randomUUID();
      const status = body.status === 'published' ? 'published' : 'draft';
      if (await legacyPublishRequiresReview(pool, config, 'job', status)) {
        return res.status(409).json({
          code: 'review_required',
          message: 'This listing type requires review. Create or submit it through the unified listings API.',
        });
      }
      await inTransaction(pool, async (connection) => {
        await connection.query(
          `INSERT INTO jobs (id, employer_user_id, employer_role, category_id, title, description, employment_type, work_mode, location, salary_min, salary_max, currency, experience_required, education_required, skills, deadline, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, req.auth.userId, employerRole, body.categoryId,
            String(body.title).trim(), String(body.description).trim(),
            employmentType, workMode,
            body.location || null, salaryMin, salaryMax, String(body.currency || 'INR').slice(0, 8),
            body.experienceRequired || null, body.educationRequired || null, JSON.stringify(body.skills || []),
            body.deadline || null, status,
          ]
        );
        await syncMarketplaceListing(connection, {
          id, type: 'job', ownerId: req.auth.userId, ownerRole: employerRole,
          categoryId: body.categoryId, title: String(body.title).trim(),
          description: String(body.description).trim(), status,
        });
      });
      return res.status(201).json({ job: { id, title: body.title, status } });
    } catch (error) {
      return next(error);
    }
  });

  // Freelance Projects (Hiring)
  router.get('/marketplace/projects', async (req, res, next) => {
    try {
      const { q, categoryId, minBudget, maxBudget, deadline, workMode, location } = req.query;
      const params = [];
      let where = `WHERE p.status = 'published'
        AND EXISTS (
          SELECT 1 FROM marketplace_listings ml
           WHERE ml.id = p.id AND ml.listing_type = 'freelance_project'
             AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
        )`;
      if (q) {
        where += ` AND (p.title LIKE ? OR p.description LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }
      if (categoryId) {
        where += ` AND p.category_id = ?`;
        params.push(categoryId);
      }
      if (minBudget) {
        where += ` AND p.budget >= ?`;
        params.push(Number(minBudget));
      }
      if (maxBudget) {
        where += ` AND p.budget <= ?`;
        params.push(Number(maxBudget));
      }
      if (deadline) {
        where += ` AND p.deadline >= ?`;
        params.push(deadline);
      }
      if (workMode) {
        where += ` AND p.work_mode = ?`;
        params.push(workMode);
      }
      if (location) {
        where += ` AND p.location LIKE ?`;
        params.push(`%${String(location).trim()}%`);
      }
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS client_name FROM freelance_projects p
         LEFT JOIN users u ON u.id = p.client_user_id
         ${where} ORDER BY p.created_at DESC LIMIT 20`,
        params
      );
      return res.json({
        projects: rows.map((r) => ({
          id: r.id,
          clientUserId: r.client_user_id,
          clientName: r.client_name || null,
          title: r.title,
          description: r.description,
          budget: r.budget ? Number(r.budget) : null,
          currency: r.currency || 'INR',
          requiredSkills: parseJson(r.required_skills, []),
          deadline: r.deadline || null,
          deliverables: r.deliverables || null,
          workMode: r.work_mode || null,
          location: r.location || null,
          status: r.status,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/projects', authenticate, async (req, res, next) => {
    try {
      const [roleRows] = await pool.query(
        `SELECT role FROM user_roles WHERE user_id = ? AND role = 'hiring'`,
        [req.auth.userId]
      );
      if (!roleRows.length) {
        return res.status(403).json({ code: 'forbidden_role', message: 'Only hiring accounts can post freelance projects.' });
      }
      const body = req.body || {};
      if (!body.title || !body.description) {
        return res.status(400).json({ code: 'validation_error', message: 'Project title and description are required.' });
      }
      if (!body.categoryId || !(await categoryIsValid(pool, body.categoryId, null, 'project'))) {
        return res.status(400).json({ code: 'invalid_category', message: 'Select a valid project category.' });
      }
      const budget = body.budget === '' || body.budget === undefined ? null : Number(body.budget);
      if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
        return res.status(400).json({ code: 'validation_error', message: 'Project budget must be a non-negative number.' });
      }
      const id = randomUUID();
      const status = body.status === 'published' ? 'published' : 'draft';
      if (await legacyPublishRequiresReview(pool, config, 'freelance_project', status)) {
        return res.status(409).json({
          code: 'review_required',
          message: 'This listing type requires review. Create or submit it through the unified listings API.',
        });
      }
      const attachmentAssetIds = body.attachmentAssetIds || [];
      if (!Array.isArray(attachmentAssetIds) || attachmentAssetIds.length > 10 ||
          attachmentAssetIds.some((assetId) => typeof assetId !== 'string')) {
        return res.status(400).json({ code: 'invalid_media', message: 'Provide up to ten valid project attachments.' });
      }
      if (attachmentAssetIds.length) {
        const [assets] = await pool.query(
          `SELECT id FROM media_assets
            WHERE user_id = ? AND role = 'hiring' AND purpose = 'project-attachment'
              AND id IN (${attachmentAssetIds.map(() => '?').join(',')})`,
          [req.auth.userId, ...attachmentAssetIds]
        );
        if (assets.length !== new Set(attachmentAssetIds).size) {
          return res.status(400).json({ code: 'invalid_media', message: 'Project attachments must be uploaded by this hiring account.' });
        }
      }
      await inTransaction(pool, async (connection) => {
        await connection.query(
          `INSERT INTO freelance_projects (id, client_user_id, category_id, title, description, required_skills, budget, currency, deadline, deliverables, work_mode, location, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, req.auth.userId, body.categoryId,
            String(body.title).trim(), String(body.description).trim(),
            JSON.stringify(body.requiredSkills || []), budget,
            String(body.currency || 'INR').slice(0, 8), body.deadline || null,
            body.deliverables || null, body.workMode || null, body.location || null, status,
          ]
        );
        await syncMarketplaceListing(connection, {
          id, type: 'freelance_project', ownerId: req.auth.userId, ownerRole: 'hiring',
          categoryId: body.categoryId, title: String(body.title).trim(),
          description: String(body.description).trim(), status,
        });
        for (const [displayOrder, mediaAssetId] of attachmentAssetIds.entries()) {
          await connection.query(
            `INSERT INTO listing_media (id, listing_type, listing_id, media_asset_id, media_role, display_order)
             VALUES (?, 'project', ?, ?, 'attachment', ?)`,
            [randomUUID(), id, mediaAssetId, displayOrder]
          );
        }
      });
      return res.status(201).json({ project: { id, title: body.title, status } });
    } catch (error) {
      return next(error);
    }
  });

  // Professionals & Businesses Discovery
  router.get('/marketplace/professionals', async (req, res, next) => {
    try {
      const {
        q,
        location,
        category,
        skill,
        minExperience,
        maxExperience,
        sort = 'newest',
        page = '1',
        limit = '20',
      } = req.query || {};
      const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
      const pageNum = Math.max(1, Number(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const minExperienceNum = minExperience === undefined || minExperience === '' ? null : Number(minExperience);
      const maxExperienceNum = maxExperience === undefined || maxExperience === '' ? null : Number(maxExperience);
      if ((minExperienceNum !== null && (!Number.isFinite(minExperienceNum) || minExperienceNum < 0)) ||
          (maxExperienceNum !== null && (!Number.isFinite(maxExperienceNum) || maxExperienceNum < 0)) ||
          (minExperienceNum !== null && maxExperienceNum !== null && minExperienceNum > maxExperienceNum)) {
        return sendError(res, 400, 'invalid_filter', 'Enter a valid professional experience range.');
      }
      if (!['newest', 'name_asc', 'experience_desc'].includes(String(sort))) {
        return sendError(res, 400, 'invalid_filter', 'Choose newest, name_asc, or experience_desc.');
      }

      const params = [];
      let where = `WHERE ur.role = 'professional' AND ur.profile_completion_status = 'complete'
        AND ml.listing_type = 'professional_profile'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'`;

      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (u.name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.fullName')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.headline')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) LIKE ?)`;
        params.push(like, like, like, like);
      }
      if (location && String(location).trim()) {
        const locLike = `%${String(location).trim()}%`;
        where += ` AND (JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.city')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.state')) LIKE ?)`;
        params.push(locLike, locLike);
      }
      if (category && String(category).trim()) {
        where += ` AND JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.primaryCategory')) LIKE ?`;
        params.push(`%${String(category).trim()}%`);
      }
      if (skill && String(skill).trim()) {
        const skillLike = `%${String(skill).trim()}%`;
        where += ` AND (
          EXISTS (SELECT 1 FROM professional_skills ps
                   WHERE ps.professional_user_id = u.id AND ps.skill LIKE ?)
          OR JSON_SEARCH(pp.profile, 'one', ?, NULL, '$.skills[*]') IS NOT NULL
        )`;
        params.push(skillLike, skillLike);
      }
      if (minExperienceNum !== null) {
        where += ` AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) >= ?`;
        params.push(minExperienceNum);
      }
      if (maxExperienceNum !== null) {
        where += ` AND CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, '$.experienceYears')) AS DECIMAL(10, 2)) <= ?`;
        params.push(maxExperienceNum);
      }

      const orderBy = sort === 'name_asc'
        ? 'ORDER BY COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, \'$.fullName\')), u.name) ASC, ml.published_at DESC'
        : sort === 'experience_desc'
          ? 'ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(pp.profile, \'$.experienceYears\')) AS DECIMAL(10, 2)) DESC, ml.published_at DESC'
          : 'ORDER BY ml.published_at DESC, u.created_at DESC';
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         JOIN professional_profiles pp ON pp.user_id = ur.user_id
         JOIN marketplace_listings ml ON ml.id = pp.listing_id
         ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);
      const [rows] = await pool.query(
        `SELECT u.id, u.name, ur.verification_status, pp.listing_id, pp.profile
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         JOIN professional_profiles pp ON pp.user_id = ur.user_id
         JOIN marketplace_listings ml ON ml.id = pp.listing_id
         ${where}
         ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      const ids = rows.map((row) => row.id);
      const skillsByUser = new Map();
      if (ids.length) {
        const [skills] = await pool.query(
          `SELECT professional_user_id, skill FROM professional_skills
            WHERE professional_user_id IN (${ids.map(() => '?').join(',')})
            ORDER BY skill`,
          ids
        );
        for (const item of skills) {
          if (!skillsByUser.has(item.professional_user_id)) skillsByUser.set(item.professional_user_id, []);
          skillsByUser.get(item.professional_user_id).push(item.skill);
        }
      }
      const items = rows.map((r) => {
        const p = parseJson(r.profile, {});
        return {
          id: r.id,
          listingId: r.listing_id || r.id,
          name: p.fullName || r.name,
          headline: p.headline || null,
          category: p.primaryCategory || 'Professional',
          experienceYears: p.experienceYears ?? null,
          city: p.city || null,
          state: p.state || null,
          verified: r.verification_status === 'verified',
          skills: skillsByUser.get(r.id) || (Array.isArray(p.skills) ? p.skills : []),
        };
      });
      return res.json({
        professionals: items,
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/businesses', async (req, res, next) => {
    try {
      const { q, location, category, page = '1', limit = '20' } = req.query || {};
      const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
      const pageNum = Math.max(1, Number(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const sort = String(req.query.sort || 'newest');
      if (!['newest', 'name_asc'].includes(sort)) {
        return sendError(res, 400, 'invalid_filter', 'Choose newest or name_asc.');
      }

      const params = [];
      let where = `WHERE ur.role = 'business' AND ur.profile_completion_status = 'complete'
        AND ml.listing_type = 'business_profile'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'`;

      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (u.name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyName')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.industry')) LIKE ?)`;
        params.push(like, like, like);
      }
      if (location && String(location).trim()) {
        const locLike = `%${String(location).trim()}%`;
        where += ` AND (JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.city')) LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.state')) LIKE ?)`;
        params.push(locLike, locLike);
      }
      if (category && String(category).trim()) {
        where += ` AND EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id = bc.category_id WHERE bc.business_user_id = u.id AND (c.id = ? OR c.name LIKE ?))`;
        params.push(String(category).trim(), `%${String(category).trim()}%`);
      }

      const orderBy = sort === 'name_asc'
        ? 'ORDER BY COALESCE(JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, \'$.storeDisplayName\')), JSON_UNQUOTE(JSON_EXTRACT(bp.profile, \'$.companyName\')), u.name) ASC, ml.published_at DESC'
        : 'ORDER BY ml.published_at DESC, u.created_at DESC';
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         JOIN business_profiles bp ON bp.user_id = ur.user_id
         JOIN marketplace_listings ml ON ml.id = bp.listing_id
         ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);
      const [rows] = await pool.query(
        `SELECT u.id, u.name, ur.verification_status, bp.listing_id, bp.profile, bp.shop_settings
         FROM user_roles ur
         JOIN users u ON u.id = ur.user_id
         JOIN business_profiles bp ON bp.user_id = ur.user_id
         JOIN marketplace_listings ml ON ml.id = bp.listing_id
         ${where}
         ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );
      const ids = rows.map((row) => row.id);
      const categoriesByBusiness = new Map();
      if (ids.length) {
        const [categories] = await pool.query(
          `SELECT bc.business_user_id, c.id, c.name FROM business_categories bc
           JOIN categories c ON c.id = bc.category_id
           WHERE bc.business_user_id IN (${ids.map(() => '?').join(',')})
           ORDER BY c.display_order, c.name`,
          ids
        );
        for (const item of categories) {
          if (!categoriesByBusiness.has(item.business_user_id)) categoriesByBusiness.set(item.business_user_id, []);
          categoriesByBusiness.get(item.business_user_id).push({ id: item.id, name: item.name });
        }
      }
      const items = rows.map((r) => {
        const p = parseJson(r.profile, {});
        const shopSettings = parseJson(r.shop_settings, {}) || {};
        return {
          id: r.id,
          listingId: r.listing_id || r.id,
          name: shopSettings.storeDisplayName || p.companyName || r.name,
          industry: p.industry || p.businessType || 'Business',
          description: shopSettings.description || p.description || null,
          city: shopSettings.city || p.city || null,
          state: shopSettings.state || p.state || null,
          verified: r.verification_status === 'verified',
          categories: categoriesByBusiness.get(r.id) || [],
        };
      });
      return res.json({
        businesses: items,
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasMore: offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });
}
