import { randomUUID } from 'node:crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createB2Client } from './storage.js';
import {
  normalizeListingType,
  syncMarketplaceListing,
  syncMarketplaceListingStatus,
} from './marketplace-listings.js';

const SECTION_TYPES = new Set([
  'service',
  'product',
  'professional',
  'professional_profile',
  'job',
  'project',
  'freelance_project',
  'business',
  'business_profile',
]);
const LISTING_TABLES = {
  product: { table: 'products', path: 'products', id: 'id', owner: 'seller_user_id', role: 'seller_role' },
  job: { table: 'jobs', path: 'jobs', id: 'id', owner: 'employer_user_id', role: 'employer_role' },
  project: { table: 'freelance_projects', path: 'projects', id: 'id', owner: 'client_user_id', role: "'hiring'" },
  freelance_project: { table: 'freelance_projects', path: 'projects', id: 'id', owner: 'client_user_id', role: "'hiring'" },
};
const PUBLIC_LISTING_OWNERS = {
  service: `SELECT s.provider_user_id AS owner_id FROM services s
    WHERE s.id = ? AND s.status = 'published' AND EXISTS (
      SELECT 1 FROM marketplace_listings ml WHERE ml.id = s.id AND ml.listing_type = 'service'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
    ) LIMIT 1`,
  product: `SELECT p.seller_user_id AS owner_id FROM products p
    WHERE p.id = ? AND p.status = 'published' AND EXISTS (
      SELECT 1 FROM marketplace_listings ml WHERE ml.id = p.id AND ml.listing_type = 'product'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
    ) LIMIT 1`,
  job: `SELECT j.employer_user_id AS owner_id FROM jobs j
    WHERE j.id = ? AND j.status = 'published' AND EXISTS (
      SELECT 1 FROM marketplace_listings ml WHERE ml.id = j.id AND ml.listing_type = 'job'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
    ) LIMIT 1`,
  project: `SELECT p.client_user_id AS owner_id FROM freelance_projects p
    WHERE p.id = ? AND p.status = 'published' AND EXISTS (
      SELECT 1 FROM marketplace_listings ml WHERE ml.id = p.id AND ml.listing_type = 'freelance_project'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
    ) LIMIT 1`,
  freelance_project: `SELECT p.client_user_id AS owner_id FROM freelance_projects p
    WHERE p.id = ? AND p.status = 'published' AND EXISTS (
      SELECT 1 FROM marketplace_listings ml WHERE ml.id = p.id AND ml.listing_type = 'freelance_project'
        AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
    ) LIMIT 1`,
  professional_profile: `SELECT owner_user_id AS owner_id FROM marketplace_listings
    WHERE id = ? AND listing_type = 'professional_profile' AND status = 'published'
      AND is_public = TRUE AND visibility = 'public' LIMIT 1`,
  professional: `SELECT pp.user_id AS owner_id FROM professional_profiles pp
    JOIN marketplace_listings ml ON ml.id = pp.listing_id
    WHERE pp.user_id = ? AND ml.listing_type = 'professional_profile'
      AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public' LIMIT 1`,
  business_profile: `SELECT owner_user_id AS owner_id FROM marketplace_listings
    WHERE id = ? AND listing_type = 'business_profile' AND status = 'published'
      AND is_public = TRUE AND visibility = 'public' LIMIT 1`,
  business: `SELECT bp.user_id AS owner_id FROM business_profiles bp
    JOIN marketplace_listings ml ON ml.id = bp.listing_id
    WHERE bp.user_id = ? AND ml.listing_type = 'business_profile'
      AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public' LIMIT 1`,
};

function sendError(res, status, code, message) {
  return res.status(status).json({ code, message });
}

function text(value, field, max = 5000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    return `${field} is required and must be at most ${max} characters.`;
  }
  return null;
}

async function hasRole(pool, userId, roles) {
  const [rows] = await pool.query(
    `SELECT role FROM user_roles WHERE user_id = ? AND role IN (${roles.map(() => '?').join(',')})`,
    [userId, ...roles]
  );
  return rows.map((row) => row.role);
}

async function validCategory(pool, categoryId, subcategoryId, listingType) {
  const [rows] = await pool.query(
    `SELECT child.id
       FROM categories child
       LEFT JOIN categories parent ON parent.id = child.parent_id
      WHERE child.id = ? AND child.is_active = TRUE
        AND (child.listing_type = ? OR parent.listing_type = ?)
      LIMIT 1`,
    [categoryId, listingType, listingType]
  );
  if (!rows.length) return false;
  if (!subcategoryId) return true;
  const [children] = await pool.query(
    `SELECT id FROM categories
      WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1`,
    [subcategoryId, categoryId]
  );
  return children.length > 0;
}

async function publicListingOwner(pool, type, id) {
  const query = PUBLIC_LISTING_OWNERS[type];
  if (!query) return null;
  const [rows] = await pool.query(query, [id]);
  return rows[0]?.owner_id || null;
}

async function ownsListing(pool, type, id, ownerId) {
  const config = LISTING_TABLES[type];
  if (!config) return false;
  const [rows] = await pool.query(
    `SELECT ${config.id} FROM ${config.table} WHERE ${config.id} = ? AND ${config.owner} = ? LIMIT 1`,
    [id, ownerId]
  );
  return rows.length > 0;
}

async function syncManagedListing(pool, type, id) {
  const listing = LISTING_TABLES[type];
  if (!listing) return;
  const [rows] = await pool.query(
    `SELECT ${listing.id} AS id, ${listing.owner} AS owner_id, ${listing.role} AS owner_role,
            category_id, ${type === 'product' ? 'subcategory_id' : 'NULL'} AS subcategory_id,
            ${type === 'product' ? 'name' : 'title'} AS title, description, status
       FROM ${listing.table} WHERE ${listing.id} = ? LIMIT 1`,
    [id]
  );
  const item = rows[0];
  if (!item) return;
  const canonicalType = normalizeListingType(type) || type;
  const [commonRows] = await pool.query(
    `SELECT * FROM marketplace_listings
      WHERE id = ? AND listing_type = ? LIMIT 1`,
    [id, canonicalType]
  );
  const common = commonRows[0];
  if (!common) return;
  await syncMarketplaceListing(pool, {
    id: item.id,
    entityId: common.entity_id || item.id,
    type,
    ownerId: item.owner_id,
    ownerRole: common.owner_role || item.owner_role,
    categoryId: item.category_id,
    subcategoryId: item.subcategory_id,
    title: item.title,
    shortSummary: common.short_summary,
    description: item.description,
    location: common.location,
    visibility: common.visibility,
    status: common.status,
    moderationStatus: common.moderation_status,
    moderationReason: common.moderation_reason,
    moderatedBy: common.moderated_by,
    moderatedAt: common.moderated_at,
    submittedForReviewAt: common.submitted_for_review_at,
    publishedAt: common.published_at,
    archivedAt: common.archived_at,
  });
}

function categoryTree(rows) {
  const byId = new Map(rows.map((row) => [row.id, {
    id: row.id,
    parentId: row.parent_id || null,
    listingType: row.listing_type || null,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    icon: row.icon_ref || null,
    imageUrl: row.image_url || null,
    displayOrder: Number(row.display_order || 0),
    children: [],
  }]));
  const roots = [];
  for (const category of byId.values()) {
    const parent = category.parentId && byId.get(category.parentId);
    if (parent) parent.children.push(category);
    else roots.push(category);
  }
  const sort = (items) => {
    items.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

export function registerMarketplaceManagementRoutes(router, { pool, authenticate, config }) {
  router.get(['/categories', '/categories/tree'], async (req, res, next) => {
    try {
      const { section } = req.query;
      if (section && !SECTION_TYPES.has(String(section))) {
        return sendError(res, 400, 'invalid_section', 'Select a valid marketplace section.');
      }
      const [rows] = await pool.query(
        `SELECT id, parent_id, listing_type, slug, name, description, icon_ref, image_url, display_order
           FROM categories WHERE is_active = TRUE
          ORDER BY display_order, name`
      );
      const tree = categoryTree(rows);
      return res.json({
        categories: section ? tree.filter((item) => item.listingType === section) : tree,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/categories/:id', async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, parent_id, listing_type, slug, name, description, icon_ref, image_url, display_order
           FROM categories WHERE id = ? AND is_active = TRUE LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'category_not_found', 'Category not found.');
      return res.json({ category: categoryTree(rows)[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/media/:id/url', async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT ma.object_key, ma.content_type
           FROM media_assets ma
          WHERE ma.id = ? AND ma.content_type IN ('image/jpeg', 'image/png', 'image/webp')
            AND (
              (ma.purpose IN ('product-image', 'listing-image') AND EXISTS (
                SELECT 1 FROM listing_media lm JOIN products p ON p.id = lm.listing_id
                 JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'product'
                 WHERE lm.media_asset_id = ma.id AND lm.listing_type = 'product'
                   AND p.status = 'published' AND p.is_active = TRUE AND ml.status = 'published'
                   AND ml.is_public = TRUE AND ml.visibility = 'public'
              ))
              OR (ma.purpose = 'portfolio-image' AND EXISTS (
                SELECT 1 FROM professional_portfolio_items pi
                JOIN user_roles ur ON ur.user_id = pi.professional_user_id
                JOIN professional_profiles pp ON pp.user_id = pi.professional_user_id
                JOIN marketplace_listings ml ON ml.id = pp.listing_id
                   AND ml.listing_type = 'professional_profile'
                 WHERE pi.media_asset_id = ma.id AND pi.status = 'published'
                   AND ur.role = 'professional' AND ur.profile_completion_status = 'complete'
                   AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
              ))
            )
          LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'media_not_found', 'Published image was not found.');
      const client = createB2Client(config);
      if (!client) return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.b2.bucket,
          Key: rows[0].object_key,
          ResponseContentType: rows[0].content_type,
        }),
        { expiresIn: config.uploadUrlTtlSeconds }
      );
      return res.json({ url, expiresIn: config.uploadUrlTtlSeconds });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-listings', authenticate, async (req, res, next) => {
    try {
      const type = String(req.query.type || '');
      const listing = LISTING_TABLES[type];
      if (!listing) return sendError(res, 400, 'invalid_listing_type', 'Select products, jobs, or projects.');
      const [rows] = await pool.query(
        `SELECT * FROM ${listing.table} WHERE ${listing.owner} = ? ORDER BY updated_at DESC LIMIT 100`,
        [req.auth.userId]
      );
      return res.json({ listings: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/marketplace/jobs/:id', authenticate, async (req, res, next) => {
    try {
      const roles = await hasRole(pool, req.auth.userId, ['hiring', 'business']);
      if (!roles.length || !(await ownsListing(pool, 'job', req.params.id, req.auth.userId))) {
        return sendError(res, 404, 'listing_not_found', 'Job was not found.');
      }
      const body = req.body || {};
      if (body.status !== undefined) {
        return sendError(res, 409, 'use_listing_lifecycle', 'Use the unified listing lifecycle endpoint to change status.');
      }
      if (body.title !== undefined && text(body.title, 'Job title', 180)) {
        return sendError(res, 400, 'validation_error', text(body.title, 'Job title', 180));
      }
      if (body.description !== undefined && text(body.description, 'Job description', 10000)) {
        return sendError(res, 400, 'validation_error', text(body.description, 'Job description', 10000));
      }
      if (body.categoryId && !(await validCategory(pool, body.categoryId, null, 'job'))) {
        return sendError(res, 400, 'invalid_category', 'Select a valid job category.');
      }
      if (body.employmentType && !['full-time', 'part-time', 'contract', 'temporary', 'internship'].includes(body.employmentType)) {
        return sendError(res, 400, 'validation_error', 'Select a valid employment type.');
      }
      if (body.workMode && !['on-site', 'remote', 'hybrid'].includes(body.workMode)) {
        return sendError(res, 400, 'validation_error', 'Select a valid work mode.');
      }
      await pool.query(
        `UPDATE jobs SET category_id = COALESCE(?, category_id), title = COALESCE(?, title),
           description = COALESCE(?, description), employment_type = COALESCE(?, employment_type),
           work_mode = COALESCE(?, work_mode), location = COALESCE(?, location),
           salary_min = COALESCE(?, salary_min), salary_max = COALESCE(?, salary_max),
           experience_required = COALESCE(?, experience_required),
           education_required = COALESCE(?, education_required),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND employer_user_id = ?`,
        [
          body.categoryId || null, body.title?.trim() || null, body.description?.trim() || null,
          body.employmentType || null, body.workMode || null, body.location || null,
          body.salaryMin === undefined ? null : Number(body.salaryMin),
          body.salaryMax === undefined ? null : Number(body.salaryMax),
          body.experienceRequired || null, body.educationRequired || null,
          req.params.id, req.auth.userId,
        ]
      );
      await syncManagedListing(pool, 'job', req.params.id);
      return res.json({ updated: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/marketplace/projects/:id', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['hiring'])).length ||
          !(await ownsListing(pool, 'project', req.params.id, req.auth.userId))) {
        return sendError(res, 404, 'listing_not_found', 'Project was not found.');
      }
      const body = req.body || {};
      if (body.status !== undefined) {
        return sendError(res, 409, 'use_listing_lifecycle', 'Use the unified listing lifecycle endpoint to change status.');
      }
      if (body.title !== undefined && text(body.title, 'Project title', 180)) {
        return sendError(res, 400, 'validation_error', text(body.title, 'Project title', 180));
      }
      if (body.description !== undefined && text(body.description, 'Project description', 10000)) {
        return sendError(res, 400, 'validation_error', text(body.description, 'Project description', 10000));
      }
      if (body.categoryId && !(await validCategory(pool, body.categoryId, null, 'project'))) {
        return sendError(res, 400, 'invalid_category', 'Select a valid project category.');
      }
      await pool.query(
        `UPDATE freelance_projects SET category_id = COALESCE(?, category_id),
           title = COALESCE(?, title), description = COALESCE(?, description),
           budget = COALESCE(?, budget), deadline = COALESCE(?, deadline),
           deliverables = COALESCE(?, deliverables), work_mode = COALESCE(?, work_mode),
           location = COALESCE(?, location),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND client_user_id = ?`,
        [
          body.categoryId || null, body.title?.trim() || null, body.description?.trim() || null,
          body.budget === undefined ? null : Number(body.budget), body.deadline || null,
          body.deliverables || null, body.workMode || null, body.location || null,
          req.params.id, req.auth.userId,
        ]
      );
      await syncManagedListing(pool, 'project', req.params.id);
      return res.json({ updated: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  for (const [type, listing] of Object.entries(LISTING_TABLES)) {
    if (type === 'freelance_project') continue;
    router.delete(`/marketplace/${listing.path}/:id`, authenticate, async (req, res, next) => {
      try {
        const requiredRoles = type === 'product'
          ? ['business']
          : type === 'job'
            ? ['hiring', 'business']
            : ['hiring'];
        if (!(await hasRole(pool, req.auth.userId, requiredRoles)).length) {
          return sendError(res, 403, 'forbidden_role', 'This account cannot manage this listing.');
        }
        const [result] = await pool.query(
          `UPDATE ${listing.table} SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE ${listing.id} = ? AND ${listing.owner} = ?`,
          [req.params.id, req.auth.userId]
        );
        if (!result.affectedRows) return sendError(res, 404, 'listing_not_found', 'Listing was not found.');
        await syncMarketplaceListingStatus(pool, type, req.params.id, 'archived');
        return res.json({ archived: true, id: req.params.id });
      } catch (error) {
        return next(error);
      }
    });
  }

  router.get('/marketplace/business/categories', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['business'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only business accounts can manage shop categories.');
      }
      const [rows] = await pool.query(
        `SELECT c.id, c.name, c.slug FROM business_categories bc
         JOIN categories c ON c.id = bc.category_id
         WHERE bc.business_user_id = ? AND c.is_active = TRUE ORDER BY c.display_order, c.name`,
        [req.auth.userId]
      );
      return res.json({ categories: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/marketplace/business/categories', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['business'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only business accounts can manage shop categories.');
      }
      const ids = req.body?.categoryIds;
      if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => typeof id !== 'string')) {
        return sendError(res, 400, 'validation_error', 'Provide up to 20 valid business category IDs.');
      }
      const uniqueIds = [...new Set(ids)];
      const [validRows] = uniqueIds.length
        ? await pool.query(
          `SELECT c.id FROM categories c
           JOIN categories root ON root.id = c.parent_id
           WHERE c.id IN (${uniqueIds.map(() => '?').join(',')})
             AND c.is_active = TRUE AND root.listing_type = 'business'`,
          uniqueIds
        )
        : [[]];
      if (validRows.length !== uniqueIds.length) {
        return sendError(res, 400, 'invalid_category', 'One or more categories are not business categories.');
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM business_categories WHERE business_user_id = ?', [req.auth.userId]);
        for (const categoryId of uniqueIds) {
          await connection.query(
            'INSERT INTO business_categories (business_user_id, category_id) VALUES (?, ?)',
            [req.auth.userId, categoryId]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return res.json({ categoryIds: uniqueIds });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/professionals/:id/portfolio', async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT p.id, p.category_id, p.title, p.description, p.project_url,
                p.media_asset_id, p.created_at
           FROM professional_portfolio_items p
           JOIN user_roles ur ON ur.user_id = p.professional_user_id
          WHERE p.professional_user_id = ? AND p.status = 'published'
            AND ur.role = 'professional' AND ur.profile_completion_status = 'complete'
            AND EXISTS (
              SELECT 1 FROM professional_profiles pp
              JOIN marketplace_listings ml ON ml.id = pp.listing_id
               WHERE pp.user_id = p.professional_user_id
                 AND ml.listing_type = 'professional_profile'
                 AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            )
          ORDER BY p.created_at DESC LIMIT 50`,
        [req.params.id]
      );
      return res.json({ portfolio: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-portfolio', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage a portfolio.');
      }
      const [rows] = await pool.query(
        `SELECT id, category_id, title, description, media_asset_id, project_url, status, created_at
           FROM professional_portfolio_items WHERE professional_user_id = ?
          ORDER BY updated_at DESC`,
        [req.auth.userId]
      );
      return res.json({ portfolio: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-skills', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage skills.');
      }
      const [rows] = await pool.query(
        `SELECT skill, category_id AS categoryId, experience_years AS experienceYears
           FROM professional_skills WHERE professional_user_id = ? ORDER BY skill`,
        [req.auth.userId]
      );
      return res.json({ skills: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/marketplace/my-skills', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage skills.');
      }
      const skills = req.body?.skills;
      if (
        !Array.isArray(skills) || skills.length > 40 ||
        skills.some((item) =>
          !item || typeof item.skill !== 'string' || !item.skill.trim() ||
          item.skill.trim().length > 120 ||
          (item.experienceYears !== undefined &&
            (!Number.isInteger(Number(item.experienceYears)) || Number(item.experienceYears) < 0 ||
              Number(item.experienceYears) > 60))
        )
      ) {
        return sendError(res, 400, 'validation_error', 'Provide up to 40 valid skills and experience values.');
      }
      const uniqueSkills = [...new Map(
        skills.map((item) => [item.skill.trim().toLowerCase(), {
          ...item,
          skill: item.skill.trim(),
        }])
      ).values()];
      for (const item of uniqueSkills) {
        if (item.categoryId && !(await validCategory(pool, item.categoryId, null, 'professional'))) {
          return sendError(res, 400, 'invalid_category', 'One or more professional categories are invalid.');
        }
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM professional_skills WHERE professional_user_id = ?', [req.auth.userId]);
        for (const item of uniqueSkills) {
          await connection.query(
            `INSERT INTO professional_skills
               (professional_user_id, skill, category_id, experience_years)
             VALUES (?, ?, ?, ?)`,
            [req.auth.userId, item.skill, item.categoryId || null, item.experienceYears ?? null]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return res.json({ skills: uniqueSkills });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/portfolio', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage a portfolio.');
      }
      const body = req.body || {};
      if (body.status === 'published') {
        const [profileListings] = await pool.query(
          `SELECT ml.id FROM professional_profiles pp
             JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE pp.user_id = ? AND ml.listing_type = 'professional_profile'
              AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            LIMIT 1`,
          [req.auth.userId]
        );
        if (!profileListings.length) {
          return sendError(res, 409, 'profile_not_public', 'Publish your professional profile before publishing portfolio items.');
        }
      }
      const invalid = text(body.title, 'Portfolio title', 180);
      if (invalid) return sendError(res, 400, 'validation_error', invalid);
      const status = body.status === 'published' ? 'published' : 'draft';
      let mediaAssetId = null;
      if (body.mediaAssetId) {
        const [assets] = await pool.query(
          `SELECT id FROM media_assets
            WHERE id = ? AND user_id = ? AND role = 'professional'
              AND purpose IN ('portfolio-image', 'portfolio-video') LIMIT 1`,
          [body.mediaAssetId, req.auth.userId]
        );
        if (!assets.length) return sendError(res, 400, 'invalid_media', 'Portfolio media is not owned by this account.');
        mediaAssetId = body.mediaAssetId;
      }
      const id = randomUUID();
      await pool.query(
        `INSERT INTO professional_portfolio_items
           (id, professional_user_id, category_id, title, description, media_asset_id, project_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, req.auth.userId, body.categoryId || null, body.title.trim(),
          typeof body.description === 'string' ? body.description.trim() : null,
          mediaAssetId, body.projectUrl || null, status,
        ]
      );
      if (mediaAssetId) {
        await pool.query("UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ?", [mediaAssetId]);
      }
      return res.status(201).json({ portfolioItem: { id, title: body.title.trim(), status } });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/marketplace/portfolio/:id', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage a portfolio.');
      }
      const body = req.body || {};
      const status = body.status;
      if (status === 'published') {
        const [profileListings] = await pool.query(
          `SELECT ml.id FROM professional_profiles pp
             JOIN marketplace_listings ml ON ml.id = pp.listing_id
            WHERE pp.user_id = ? AND ml.listing_type = 'professional_profile'
              AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
            LIMIT 1`,
          [req.auth.userId]
        );
        if (!profileListings.length) {
          return sendError(res, 409, 'profile_not_public', 'Publish your professional profile before publishing portfolio items.');
        }
      }
      if (status !== undefined && !['draft', 'published', 'paused', 'archived'].includes(status)) {
        return sendError(res, 400, 'invalid_status', 'Select a valid portfolio status.');
      }
      const [result] = await pool.query(
        `UPDATE professional_portfolio_items
            SET title = COALESCE(?, title), description = COALESCE(?, description),
                category_id = COALESCE(?, category_id), project_url = COALESCE(?, project_url),
                status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND professional_user_id = ?`,
        [
          body.title || null, body.description || null, body.categoryId || null,
          body.projectUrl || null, status || null, req.params.id, req.auth.userId,
        ]
      );
      if (!result.affectedRows) return sendError(res, 404, 'portfolio_not_found', 'Portfolio item was not found.');
      return res.json({ updated: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/marketplace/portfolio/:id', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['professional'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only professionals can manage a portfolio.');
      }
      const [result] = await pool.query(
        `UPDATE professional_portfolio_items SET status = 'archived'
          WHERE id = ? AND professional_user_id = ?`,
        [req.params.id, req.auth.userId]
      );
      if (!result.affectedRows) return sendError(res, 404, 'portfolio_not_found', 'Portfolio item was not found.');
      return res.json({ archived: true, id: req.params.id });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/favorites', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT listing_type AS type, listing_id AS id, created_at AS createdAt
           FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        [req.auth.userId]
      );
      return res.json({ favorites: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/favorites', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['customer'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only customer accounts can save favorites.');
      }
      const { type, id } = req.body || {};
      if (!SECTION_TYPES.has(type) || typeof id !== 'string' || !id.trim()) {
        return sendError(res, 400, 'validation_error', 'A valid listing type and ID are required.');
      }
      const ownerId = await publicListingOwner(pool, type, id);
      if (!ownerId) return sendError(res, 404, 'listing_not_found', 'Published listing was not found.');
      if (ownerId === req.auth.userId) {
        return sendError(res, 400, 'invalid_favorite', 'You cannot save your own listing.');
      }
      await pool.query(
        `INSERT IGNORE INTO favorites (user_id, listing_type, listing_id) VALUES (?, ?, ?)`,
        [req.auth.userId, type, id]
      );
      return res.status(201).json({ saved: true, type, id });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/marketplace/favorites/:type/:id', authenticate, async (req, res, next) => {
    try {
      await pool.query(
        'DELETE FROM favorites WHERE user_id = ? AND listing_type = ? AND listing_id = ?',
        [req.auth.userId, req.params.type, req.params.id]
      );
      return res.json({ removed: true });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/enquiries', authenticate, async (req, res, next) => {
    try {
      const sent = req.query.view === 'sent';
      const field = sent ? 'sender_user_id' : 'owner_user_id';
      const [rows] = await pool.query(
        `SELECT id, sender_user_id AS senderUserId, listing_type AS listingType,
                listing_id AS listingId, owner_user_id AS ownerUserId, message, status, created_at AS createdAt
           FROM enquiries WHERE ${field} = ? ORDER BY created_at DESC LIMIT 100`,
        [req.auth.userId]
      );
      return res.json({ enquiries: rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/enquiries', authenticate, async (req, res, next) => {
    try {
      if (!(await hasRole(pool, req.auth.userId, ['customer'])).length) {
        return sendError(res, 403, 'forbidden_role', 'Only customer accounts can send enquiries.');
      }
      const { type, id, message } = req.body || {};
      if (!SECTION_TYPES.has(type) || typeof id !== 'string' || !id.trim()) {
        return sendError(res, 400, 'validation_error', 'A valid listing type and ID are required.');
      }
      const invalid = text(message, 'Enquiry message', 3000);
      if (invalid) return sendError(res, 400, 'validation_error', invalid);
      const ownerId = await publicListingOwner(pool, type, id);
      if (!ownerId) return sendError(res, 404, 'listing_not_found', 'Published listing was not found.');
      if (ownerId === req.auth.userId) return sendError(res, 400, 'invalid_enquiry', 'You cannot enquire about your own listing.');
      const enquiryId = randomUUID();
      await pool.query(
        `INSERT INTO enquiries (id, sender_user_id, listing_type, listing_id, owner_user_id, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [enquiryId, req.auth.userId, type, id, ownerId, message.trim()]
      );
      return res.status(201).json({ enquiry: { id: enquiryId, type, listingId: id, status: 'open' } });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/marketplace/enquiries/:id', authenticate, async (req, res, next) => {
    try {
      const status = req.body?.status;
      if (!['open', 'replied', 'closed'].includes(status)) {
        return sendError(res, 400, 'invalid_status', 'Select open, replied, or closed.');
      }
      const [result] = await pool.query(
        `UPDATE enquiries SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_user_id = ?`,
        [status, req.params.id, req.auth.userId]
      );
      if (!result.affectedRows) return sendError(res, 404, 'enquiry_not_found', 'Enquiry was not found.');
      return res.json({ updated: true, id: req.params.id, status });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/marketplace/:type/:id/media', authenticate, async (req, res, next) => {
    try {
      const { type } = req.params;
      const map = {
        products: { listingType: 'product', role: 'business', purpose: 'product-image' },
        projects: { listingType: 'project', role: 'hiring', purpose: 'project-attachment' },
      };
      const config = map[type];
      if (!config) return sendError(res, 404, 'route_not_found', 'Listing media route was not found.');
      if (!(await hasRole(pool, req.auth.userId, [config.role])).length) {
        return sendError(res, 403, 'forbidden_role', `Only ${config.role} accounts can attach this media.`);
      }
      if (!(await ownsListing(pool, config.listingType, req.params.id, req.auth.userId))) {
        return sendError(res, 404, 'listing_not_found', 'Owned listing was not found.');
      }
      const mediaAssetId = req.body?.mediaAssetId;
      const [assets] = await pool.query(
        `SELECT id FROM media_assets WHERE id = ? AND user_id = ? AND role = ? AND purpose = ? LIMIT 1`,
        [mediaAssetId, req.auth.userId, config.role, config.purpose]
      );
      if (!assets.length) return sendError(res, 400, 'invalid_media', 'Media asset is not owned by this account.');
      const mediaId = randomUUID();
      await pool.query(
        `INSERT INTO listing_media (id, listing_type, listing_id, media_asset_id, media_role, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mediaId, config.listingType, req.params.id, mediaAssetId,
          config.purpose === 'product-image' ? 'image' : 'attachment',
          Number(req.body?.displayOrder || 0),
        ]
      );
      return res.status(201).json({ media: { id: mediaId, mediaAssetId, type: config.purpose } });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendError(res, 409, 'media_already_attached', 'This media is already attached.');
      }
      return next(error);
    }
  });
}
