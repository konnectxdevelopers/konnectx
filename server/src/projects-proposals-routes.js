import { randomUUID } from 'node:crypto';
import {
  getModerationPolicy,
  isRecord,
  parseJson,
  recordStatusHistory,
  requiresReviewForType,
  validateOwnerTransition,
  withTransaction,
} from './listing-engine.js';
import { syncMarketplaceListing, syncMarketplaceListingStatus } from './marketplace-listings.js';
import { createPrivateReadUrl } from './storage.js';

const PROJECT_ROOT_ID = '20000000-0000-4000-8000-000000000005';
const VALID_BUDGET_TYPES = new Set(['fixed', 'hourly', 'range', 'negotiable']);
const VALID_WORK_MODES = new Set(['remote', 'on-site', 'hybrid']);
const VALID_VISIBILITIES = new Set(['public', 'unlisted', 'private']);
const VALID_PROPOSAL_STATUSES = new Set([
  'submitted',
  'shortlisted',
  'selected',
  'declined',
]);
const PROJECT_LIFECYCLE_ACTIONS = new Set([
  'save_draft',
  'submit',
  'publish',
  'pause',
  'resume',
  'award',
  'complete',
  'cancel',
  'archive',
  'restore',
]);
const PROJECT_STATUS_TRANSITIONS = Object.freeze({
  draft: new Set(['pending_review', 'published', 'cancelled', 'archived']),
  pending_review: new Set(['cancelled', 'archived']),
  published: new Set(['paused', 'awarded', 'cancelled', 'archived']),
  paused: new Set(['published', 'pending_review', 'awarded', 'cancelled', 'archived']),
  awarded: new Set(['completed', 'cancelled', 'archived']),
  completed: new Set(['archived']),
  cancelled: new Set(['archived']),
  archived: new Set(['draft']),
});

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

function optionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string') return { error: `${fieldName} must be text.` };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (trimmed.length > maxLength) {
    return { error: `${fieldName} must be no more than ${maxLength} characters.` };
  }
  return { value: trimmed };
}

function requiredText(value, maxLength, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: `${fieldName} is required.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `${fieldName} must be no more than ${maxLength} characters.` };
  }
  return { value: trimmed };
}

function optionalNumber(value, fieldName, { min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > 100000000) {
    return { error: `${fieldName} must be a valid number.` };
  }
  return { value: Number(n.toFixed(2)) };
}

function normalizeSkills(raw) {
  if (!raw) return [];
  const list = typeof raw === 'string'
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : Array.isArray(raw)
      ? raw.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
  return [...new Set(list)].slice(0, 30);
}

function isDatePast(dateValue) {
  if (!dateValue) return false;
  const date = dateOnly(dateValue);
  return isValidDateString(date) && date < dateOnly(new Date());
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isValidDateString(dateValue) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateValue;
}

function paginationFromQuery(query, defaultLimit = 20, maxLimit = 100) {
  const limitValue = Number(query.limit);
  const pageValue = Number(query.page);
  const limit = Number.isInteger(limitValue) && limitValue > 0
    ? Math.min(maxLimit, limitValue)
    : defaultLimit;
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  return { limit, page, offset: (page - 1) * limit };
}

async function resolveOptionalUserId(req, authenticate) {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return new Promise((resolve) => {
    authenticate(req, {
      status: () => ({ json: () => resolve(null) }),
    }, () => {
      resolve(req.auth?.userId || null);
    });
  }).catch(() => null);
}

async function ensureProjectPosterAccess(pool, userId, requestedRole = null) {
  const [roleRows] = await pool.query(
    `SELECT role FROM user_roles WHERE user_id = ? AND role IN ('hiring', 'business')`,
    [userId]
  );
  const roleSet = new Set(roleRows.map((r) => r.role));

  if (requestedRole === 'hiring') {
    if (!roleSet.has('hiring')) {
      return { ok: false, status: 403, code: 'forbidden_role', message: 'Your account does not hold the hiring role.' };
    }
    return { ok: true, clientRole: 'hiring' };
  }

  if (requestedRole === 'business') {
    if (!roleSet.has('business')) {
      return { ok: false, status: 403, code: 'forbidden_role', message: 'Your account does not hold the business role.' };
    }
    const [bp] = await pool.query('SELECT hiring_enabled FROM business_profiles WHERE user_id = ? LIMIT 1', [userId]);
    if (!bp.length || !bp[0].hiring_enabled) {
      return { ok: false, status: 403, code: 'hiring_capability_disabled', message: 'Business project posting requires hiring capability to be enabled.' };
    }
    return { ok: true, clientRole: 'business' };
  }

  if (roleSet.has('hiring')) {
    return { ok: true, clientRole: 'hiring' };
  }
  if (roleSet.has('business')) {
    const [bp] = await pool.query('SELECT hiring_enabled FROM business_profiles WHERE user_id = ? LIMIT 1', [userId]);
    if (bp.length && bp[0].hiring_enabled) {
      return { ok: true, clientRole: 'business' };
    }
    return { ok: false, status: 403, code: 'hiring_capability_disabled', message: 'Business project posting requires hiring capability to be enabled.' };
  }

  return { ok: false, status: 403, code: 'forbidden_role', message: 'Only hiring accounts or authorized businesses can post freelance projects.' };
}

async function ensureProposerAccess(pool, userId, { businessProposalsEnabled = false } = {}) {
  const [roleRows] = await pool.query(
    `SELECT role FROM user_roles WHERE user_id = ? AND role IN ('professional', 'business')`,
    [userId]
  );
  const roles = roleRows.map((r) => r.role);
  if (!roles.includes('professional') && !(businessProposalsEnabled && roles.includes('business'))) {
    return {
      ok: false,
      status: 403,
      code: 'forbidden_role',
      message: businessProposalsEnabled
        ? 'Only professional or authorized business accounts can submit proposals.'
        : 'Only professional accounts can submit proposals.',
    };
  }
  return { ok: true, proposerRole: roles.includes('professional') ? 'professional' : 'business' };
}

async function validateProjectCategory(pool, categoryId, subcategoryId, { required = true } = {}) {
  if (!categoryId) {
    return required ? { ok: false, message: 'Select a project category.' } : { ok: true, categoryId: null, subcategoryId: null };
  }
  const cleanCat = String(categoryId).trim();
  const cleanSub = typeof subcategoryId === 'string' && subcategoryId.trim() ? subcategoryId.trim() : null;
  const [rows] = await pool.query(
    `SELECT c.id FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.id = ? AND c.is_active = TRUE
        AND (c.listing_type = 'project' OR parent.listing_type = 'project' OR c.parent_id = ?)
      LIMIT 1`,
    [cleanCat, PROJECT_ROOT_ID]
  );
  if (!rows.length) {
    return { ok: false, message: 'Select a valid project category.' };
  }
  if (cleanSub) {
    const [subRows] = await pool.query(
      'SELECT id FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
      [cleanSub, cleanCat]
    );
    if (!subRows.length) {
      return { ok: false, message: 'The selected subcategory does not belong to this project category.' };
    }
  }
  return { ok: true, categoryId: cleanCat, subcategoryId: cleanSub };
}

async function hydrateProjects(pool, rows) {
  if (!rows.length) return [];
  const projectIds = rows.map((r) => r.id);
  const placeholders = projectIds.map(() => '?').join(',');

  const [skillRows] = await pool.query(
    `SELECT project_id, skill FROM project_skills WHERE project_id IN (${placeholders})`,
    projectIds
  );
  const [attachmentRows] = await pool.query(
    `SELECT id, project_id, file_name, mime_type, file_size
       FROM project_attachments
      WHERE project_id IN (${placeholders})
      ORDER BY created_at`,
    projectIds
  );
  const skillMap = new Map();
  const attachmentMap = new Map();
  for (const s of skillRows) {
    if (!skillMap.has(s.project_id)) skillMap.set(s.project_id, []);
    skillMap.get(s.project_id).push(s.skill);
  }
  for (const attachment of attachmentRows) {
    if (!attachmentMap.has(attachment.project_id)) attachmentMap.set(attachment.project_id, []);
    attachmentMap.get(attachment.project_id).push({
      id: attachment.id,
      fileName: attachment.file_name || 'Project Attachment',
      mimeType: attachment.mime_type || null,
      fileSize: attachment.file_size === null ? null : Number(attachment.file_size),
    });
  }

  const catIds = [...new Set(rows.flatMap((r) => [r.category_id, r.subcategory_id].filter(Boolean)))];
  const catNameMap = new Map();
  if (catIds.length) {
    const [cats] = await pool.query(
      `SELECT id, name FROM categories WHERE id IN (${catIds.map(() => '?').join(',')})`,
      catIds
    );
    for (const c of cats) catNameMap.set(c.id, c.name);
  }

  return rows.map((r) => ({
    id: r.id,
    listingId: r.id,
    listingType: 'freelance_project',
    clientUserId: r.client_user_id,
    clientRole: r.client_role || 'hiring',
    clientName: r.client_name || null,
    categoryId: r.category_id || null,
    categoryName: catNameMap.get(r.category_id) || null,
    subcategoryId: r.subcategory_id || null,
    subcategoryName: catNameMap.get(r.subcategory_id) || null,
    title: r.title,
    description: r.description || '',
    deliverables: r.deliverables || null,
    budgetType: r.budget_type || 'fixed',
    budget: r.budget === null || r.budget === undefined ? null : Number(r.budget),
    budgetMin: r.budget_min === null || r.budget_min === undefined ? null : Number(r.budget_min),
    budgetMax: r.budget_max === null || r.budget_max === undefined ? null : Number(r.budget_max),
    currency: r.currency || 'INR',
    requiredSkills: skillMap.get(r.id) || parseJson(r.required_skills, []),
    attachments: attachmentMap.get(r.id) || [],
    workMode: r.work_mode || 'remote',
    location: r.location || null,
    experienceLevel: r.experience_level || null,
    deadline: dateOnly(r.deadline),
    proposalDeadline: dateOnly(r.proposal_deadline),
    isProposalExpired: isDatePast(r.proposal_deadline),
    screeningQuestions: parseJson(r.screening_questions, []),
    visibility: r.visibility || 'public',
    proposalCount: r.proposal_count !== undefined ? Number(r.proposal_count || 0) : undefined,
    isActive: r.is_active === undefined ? true : Boolean(r.is_active),
    status: r.status,
    moderationStatus: r.moderation_status || null,
    moderationReason: r.moderation_reason || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function registerProjectsProposalsRoutes(router, { pool, config, authenticate }) {
  // ---- Owner Project Management ----
  router.get('/marketplace/my-projects', authenticate, async (req, res, next) => {
    try {
      const access = await ensureProjectPosterAccess(pool, req.auth.userId, req.query.role || null);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const pagination = paginationFromQuery(req.query, 50, 50);
      const params = [req.auth.userId];
      let where = `WHERE p.client_user_id = ? AND p.status != 'deleted'`;
      if (statusFilter && statusFilter !== 'all') {
        where += ` AND p.status = ?`;
        params.push(statusFilter);
      }
      if (q) {
        const like = `%${q}%`;
        where += ` AND (p.title LIKE ? OR p.description LIKE ?)`;
        params.push(like, like);
      }

      const [rows] = await pool.query(
        `SELECT p.*, u.name AS client_name,
                ml.moderation_status, ml.moderation_reason,
                (SELECT COUNT(*) FROM project_proposals pp WHERE pp.project_id = p.id) AS proposal_count
           FROM freelance_projects p
           LEFT JOIN users u ON u.id = p.client_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          ${where}
          ORDER BY p.updated_at DESC
          LIMIT ? OFFSET ?`,
        [...params, pagination.limit, pagination.offset]
      );

      const [countRows] = await pool.query(
        `SELECT status, COUNT(*) AS count
           FROM freelance_projects WHERE client_user_id = ? AND status != 'deleted'
          GROUP BY status`,
        [req.auth.userId]
      );
      const countsByStatus = {
        all: 0,
        draft: 0,
        pending_review: 0,
        published: 0,
        paused: 0,
        awarded: 0,
        completed: 0,
        cancelled: 0,
        archived: 0,
      };
      for (const r of countRows) {
        countsByStatus[r.status] = Number(r.count || 0);
        countsByStatus.all += Number(r.count || 0);
      }

      const [filteredCountRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM freelance_projects p ${where}`,
        params
      );
      const total = Number(filteredCountRows[0]?.total || 0);
      const items = await hydrateProjects(pool, rows);
      return res.json({
        items,
        countsByStatus,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
          hasMore: pagination.offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-projects/:id', authenticate, async (req, res, next) => {
    try {
      const access = await ensureProjectPosterAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const [rows] = await pool.query(
        `SELECT p.*, u.name AS client_name,
                ml.moderation_status, ml.moderation_reason,
                (SELECT COUNT(*) FROM project_proposals pp WHERE pp.project_id = p.id) AS proposal_count
           FROM freelance_projects p
           LEFT JOIN users u ON u.id = p.client_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          WHERE p.id = ? AND p.client_user_id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Project was not found.');

      const [project] = await hydrateProjects(pool, rows);
      const [attachments] = await pool.query(
        `SELECT id, media_asset_id, file_name, mime_type, file_size
           FROM project_attachments
          WHERE project_id = ?
          ORDER BY created_at`,
        [project.id]
      );
      project.attachments = attachments.map((attachment) => ({
        id: attachment.id,
        mediaAssetId: attachment.media_asset_id,
        fileName: attachment.file_name || 'Project Attachment',
        mimeType: attachment.mime_type || null,
        fileSize: attachment.file_size === null ? null : Number(attachment.file_size),
      }));
      return res.json({ project });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-projects/:id/attachments/:attachmentId/url', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT pa.object_key
           FROM project_attachments pa
           JOIN freelance_projects p ON p.id = pa.project_id
          WHERE pa.id = ? AND pa.project_id = ? AND p.client_user_id = ?
          LIMIT 1`,
        [req.params.attachmentId, req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'attachment_not_found', 'Attachment was not found.');
      if (!rows[0].object_key) return sendError(res, 404, 'attachment_not_found', 'Attachment file is missing.');
      const url = await createPrivateReadUrl(config, rows[0].object_key);
      if (!url) return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      return res.json({ url, expiresIn: config.uploadUrlTtlSeconds });
    } catch (error) {
      return next(error);
    }
  });

  async function saveOrUpdateProject(req, res, next, { isCreate }) {
    try {
      const body = req.body || {};
      const access = await ensureProjectPosterAccess(pool, req.auth.userId, body.clientRole || body.ownerRole || null);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      let existing = null;
      if (!isCreate) {
        const [rows] = await pool.query(
          `SELECT p.*, ml.moderation_status
             FROM freelance_projects p
             LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
            WHERE p.id = ? AND p.client_user_id = ? AND p.status != 'deleted'
            LIMIT 1`,
          [req.params.id, req.auth.userId]
        );
        if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Project was not found.');
        existing = rows[0];
        if (req.method === 'PATCH' && body.status !== undefined) {
          return sendError(res, 409, 'use_listing_lifecycle', 'Use the project transition endpoint to change status.');
        }
      }

      const action = typeof body.action === 'string' && PROJECT_LIFECYCLE_ACTIONS.has(body.action) ? body.action : null;
      const requestedStatusRaw = action === 'save_draft'
        ? 'draft'
        : action === 'submit'
          ? 'pending_review'
          : action === 'publish' || action === 'resume'
            ? 'published'
            : action === 'pause'
              ? 'paused'
              : action === 'award'
                ? 'awarded'
                : action === 'complete'
                  ? 'completed'
                  : action === 'cancel'
                    ? 'cancelled'
                    : action === 'archive'
                      ? 'archived'
                      : body.status;

      const policy = await getModerationPolicy(pool, config);
      let nextStatus = existing ? existing.status : (requestedStatusRaw === 'published' ? 'published' : 'draft');
      if (isCreate) {
        if (requestedStatusRaw === 'pending_review') {
          nextStatus = 'pending_review';
        } else if (requestedStatusRaw === 'published') {
          if (requiresReviewForType(policy, 'freelance_project')) {
            if (!action) {
              return sendError(res, 409, 'review_required', 'Projects require moderation review before publishing.');
            }
            nextStatus = 'pending_review';
          } else {
            nextStatus = 'published';
          }
        } else {
          nextStatus = 'draft';
        }
      } else if (requestedStatusRaw !== undefined && requestedStatusRaw !== existing.status) {
        if (!PROJECT_STATUS_TRANSITIONS[existing.status]?.has(requestedStatusRaw)) {
          return sendError(res, 409, 'invalid_project_transition', 'This project cannot move to the requested status.');
        }
        if (['awarded', 'completed', 'cancelled', 'archived'].includes(requestedStatusRaw) ||
            existing.status === 'archived') {
          nextStatus = requestedStatusRaw;
        } else {
          const candidate = requestedStatusRaw === 'published' && requiresReviewForType(policy, 'freelance_project') && existing.moderation_status !== 'approved'
            ? 'pending_review'
            : requestedStatusRaw;
          const transition = validateOwnerTransition({
            fromStatus: existing.status,
            toStatus: candidate,
            listingType: 'freelance_project',
            moderationPolicy: policy,
            moderationStatus: existing.moderation_status,
          });
          if (!transition.ok) return sendError(res, transition.status, transition.code, transition.message);
          nextStatus = transition.toStatus;
        }
      }

      const isDraft = nextStatus === 'draft';
      const titleCheck = body.title !== undefined || isCreate ? requiredText(body.title, 180, 'Project title') : { value: existing.title };
      if (titleCheck.error) return sendError(res, 400, 'validation_error', titleCheck.error);

      const descRaw = body.description !== undefined ? body.description : existing?.description;
      const descCheck = isDraft ? optionalText(descRaw || null, 10000, 'Project scope') : requiredText(descRaw, 10000, 'Project scope');
      if (descCheck.error) return sendError(res, 400, 'validation_error', descCheck.error);

      const deliverablesCheck = body.deliverables !== undefined
        ? optionalText(body.deliverables, 4000, 'Deliverables')
        : { value: existing?.deliverables || null };
      if (deliverablesCheck.error) return sendError(res, 400, 'validation_error', deliverablesCheck.error);

      const budgetType = body.budgetType || existing?.budget_type || 'fixed';
      if (!VALID_BUDGET_TYPES.has(budgetType)) {
        return sendError(res, 400, 'validation_error', 'Select a valid budget type.');
      }
      const workMode = body.workMode || existing?.work_mode || 'remote';
      if (!VALID_WORK_MODES.has(workMode)) {
        return sendError(res, 400, 'validation_error', 'Select a valid work mode.');
      }
      const visibility = body.visibility || existing?.visibility || 'public';
      if (!VALID_VISIBILITIES.has(visibility)) {
        return sendError(res, 400, 'validation_error', 'Visibility must be public, unlisted, or private.');
      }

      const catCheck = await validateProjectCategory(
        pool,
        body.categoryId !== undefined ? body.categoryId : existing?.category_id,
        body.subcategoryId !== undefined ? body.subcategoryId : existing?.subcategory_id,
        { required: !isDraft }
      );
      if (!catCheck.ok) return sendError(res, 400, 'invalid_category', catCheck.message);

      const budgetVal = optionalNumber(body.budget !== undefined ? body.budget : existing?.budget, 'Budget', { min: 0 });
      const budgetMin = optionalNumber(body.budgetMin !== undefined ? body.budgetMin : existing?.budget_min, 'Minimum budget', { min: 0 });
      const budgetMax = optionalNumber(body.budgetMax !== undefined ? body.budgetMax : existing?.budget_max, 'Maximum budget', { min: 0 });
      if (budgetVal.error || budgetMin.error || budgetMax.error) {
        return sendError(res, 400, 'validation_error', budgetVal.error || budgetMin.error || budgetMax.error);
      }
      if (budgetMin.value !== null && budgetMax.value !== null && budgetMax.value < budgetMin.value) {
        return sendError(res, 400, 'validation_error', 'Maximum budget must be greater than or equal to minimum budget.');
      }

      const deadlineVal = body.deadline !== undefined
        ? (body.deadline ? String(body.deadline).trim() : null)
        : existing?.deadline ? dateOnly(existing.deadline) : null;
      const proposalDeadlineVal = body.proposalDeadline !== undefined
        ? (body.proposalDeadline ? String(body.proposalDeadline).trim() : null)
        : existing?.proposal_deadline ? dateOnly(existing.proposal_deadline) : null;
      if ((deadlineVal && !isValidDateString(deadlineVal)) ||
          (proposalDeadlineVal && !isValidDateString(proposalDeadlineVal))) {
        return sendError(res, 400, 'validation_error', 'Deadlines must be valid YYYY-MM-DD dates.');
      }
      if (!isDraft && deadlineVal && isDatePast(deadlineVal)) {
        return sendError(res, 400, 'validation_error', 'Project deadline must be today or later.');
      }
      if (proposalDeadlineVal && deadlineVal && proposalDeadlineVal > deadlineVal) {
        return sendError(res, 400, 'validation_error', 'Proposal deadline cannot be after the project deadline.');
      }
      if (!isDraft && proposalDeadlineVal && isDatePast(proposalDeadlineVal)) {
        return sendError(res, 400, 'validation_error', 'Proposal deadline must be today or later.');
      }
      if (!isDraft && budgetType === 'range' &&
          (budgetMin.value === null || budgetMax.value === null)) {
        return sendError(res, 400, 'validation_error', 'A range budget requires both minimum and maximum amounts.');
      }
      if (!isDraft && ['fixed', 'hourly'].includes(budgetType) && budgetVal.value === null) {
        return sendError(res, 400, 'validation_error', 'A budget amount is required for fixed and hourly projects.');
      }

      const skills = body.requiredSkills !== undefined ? normalizeSkills(body.requiredSkills) : parseJson(existing?.required_skills, []);
      const locationText = body.location !== undefined ? optionalText(body.location, 160, 'Location') : { value: existing?.location || null };
      const expLevel = body.experienceLevel !== undefined ? optionalText(body.experienceLevel, 60, 'Experience level') : { value: existing?.experience_level || null };
      if (locationText.error || expLevel.error) return sendError(res, 400, 'validation_error', locationText.error || expLevel.error);

      const currency = String(body.currency || existing?.currency || 'INR').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return sendError(res, 400, 'validation_error', 'Currency must be a three-letter currency code.');
      }
      const screeningQuestions = Array.isArray(body.screeningQuestions)
        ? body.screeningQuestions.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 10)
        : parseJson(existing?.screening_questions, []);
      const attachmentAssetIds = body.attachmentAssetIds === undefined
        ? null
        : [...new Set(Array.isArray(body.attachmentAssetIds)
          ? body.attachmentAssetIds.filter((id) => typeof id === 'string' && id.trim())
          : [])];
      if (attachmentAssetIds?.length > 10) {
        return sendError(res, 400, 'invalid_media', 'Attach at most 10 project files.');
      }
      const projectAssets = new Map();
      if (attachmentAssetIds?.length) {
        const [assets] = await pool.query(
          `SELECT id, object_key, content_type, byte_size
             FROM media_assets
            WHERE user_id = ? AND role = ? AND purpose = 'project-attachment'
              AND status IN ('pending', 'attached')
              AND id IN (${attachmentAssetIds.map(() => '?').join(',')})`,
          [req.auth.userId, access.clientRole, ...attachmentAssetIds]
        );
        if (assets.length !== attachmentAssetIds.length) {
          return sendError(res, 400, 'invalid_media', 'Project attachments must be uploaded to your account using the project attachment purpose.');
        }
        for (const asset of assets) projectAssets.set(asset.id, asset);
      }

      const projectId = existing ? existing.id : randomUUID();

      await withTransaction(pool, async (connection) => {
        if (isCreate) {
          await connection.query(
            `INSERT INTO freelance_projects (
               id, client_user_id, client_role, category_id, subcategory_id, title,
               description, deliverables, budget_type, budget, budget_min, budget_max,
               currency, required_skills, work_mode, location, experience_level,
               deadline, proposal_deadline, screening_questions, visibility, is_active, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId, req.auth.userId, access.clientRole, catCheck.categoryId, catCheck.subcategoryId,
              titleCheck.value, descCheck.value || '', deliverablesCheck.value, budgetType,
              budgetVal.value ?? budgetMin.value ?? null, budgetMin.value, budgetMax.value,
              currency, JSON.stringify(skills), workMode, locationText.value, expLevel.value,
              deadlineVal, proposalDeadlineVal, JSON.stringify(screeningQuestions), visibility, 1, nextStatus,
            ]
          );
        } else {
          await connection.query(
            `UPDATE freelance_projects
                SET category_id = ?, subcategory_id = ?, title = ?, description = ?,
                    deliverables = ?, budget_type = ?, budget = ?, budget_min = ?, budget_max = ?,
                    currency = ?, required_skills = ?, work_mode = ?, location = ?,
                    experience_level = ?, deadline = ?, proposal_deadline = ?,
                    screening_questions = ?, visibility = ?, status = ?,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND client_user_id = ?`,
            [
              catCheck.categoryId, catCheck.subcategoryId, titleCheck.value, descCheck.value || '',
              deliverablesCheck.value, budgetType, budgetVal.value ?? budgetMin.value ?? null,
              budgetMin.value, budgetMax.value, currency, JSON.stringify(skills), workMode,
              locationText.value, expLevel.value, deadlineVal, proposalDeadlineVal,
              JSON.stringify(screeningQuestions), visibility, nextStatus, projectId, req.auth.userId,
            ]
          );
        }

        await connection.query('DELETE FROM project_skills WHERE project_id = ?', [projectId]);
        for (const skill of skills) {
          await connection.query('INSERT IGNORE INTO project_skills (project_id, skill) VALUES (?, ?)', [projectId, skill.slice(0, 80)]);
        }
        if (attachmentAssetIds !== null) {
          await connection.query('DELETE FROM project_attachments WHERE project_id = ?', [projectId]);
          for (const assetId of attachmentAssetIds) {
            const asset = projectAssets.get(assetId);
            await connection.query(
              `INSERT INTO project_attachments (
                 id, project_id, media_asset_id, file_name, mime_type, file_size, object_key
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                projectId,
                assetId,
                asset.file_name || 'Project Attachment',
                asset.content_type || null,
                asset.byte_size || null,
                asset.object_key || null,
              ]
            );
            await connection.query(
              `UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ? AND user_id = ?`,
              [assetId, req.auth.userId]
            );
          }
        }

        await syncMarketplaceListing(connection, {
          id: projectId,
          type: 'freelance_project',
          ownerId: req.auth.userId,
          ownerRole: access.clientRole,
          categoryId: catCheck.categoryId,
          subcategoryId: catCheck.subcategoryId,
          title: titleCheck.value,
          shortSummary: (descCheck.value || titleCheck.value).slice(0, 240),
          description: descCheck.value || '',
          location: locationText.value ? { city: locationText.value, workMode } : { workMode },
          visibility,
          status: nextStatus,
        });

        if (isCreate || nextStatus !== existing.status) {
          await recordStatusHistory(connection, {
            listingId: projectId,
            listingType: 'freelance_project',
            fromStatus: existing ? existing.status : null,
            toStatus: nextStatus,
            userId: req.auth.userId,
            role: access.clientRole,
          });
        }
      });

      const [saved] = await pool.query(
        `SELECT p.*, u.name AS client_name FROM freelance_projects p
           LEFT JOIN users u ON u.id = p.client_user_id
          WHERE p.id = ? LIMIT 1`,
        [projectId]
      );
      const [project] = await hydrateProjects(pool, saved);
      return res.status(isCreate ? 201 : 200).json({ project });
    } catch (error) {
      return next(error);
    }
  }

  router.post('/marketplace/projects', authenticate, (req, res, next) =>
    saveOrUpdateProject(req, res, next, { isCreate: true })
  );
  router.put('/marketplace/projects/:id', authenticate, (req, res, next) =>
    saveOrUpdateProject(req, res, next, { isCreate: false })
  );
  router.patch('/marketplace/projects/:id', authenticate, (req, res, next) =>
    saveOrUpdateProject(req, res, next, { isCreate: false })
  );

  router.post('/marketplace/projects/:id/transition', authenticate, async (req, res, next) => {
    try {
      const access = await ensureProjectPosterAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const action = String(req.body?.action || '').trim();
      const map = {
        save_draft: 'draft',
        submit: 'pending_review',
        publish: 'published',
        resume: 'published',
        pause: 'paused',
        award: 'awarded',
        complete: 'completed',
        cancel: 'cancelled',
        archive: 'archived',
        restore: 'draft',
      };
      const target = map[action];
      if (!target) return sendError(res, 400, 'invalid_action', 'Invalid project lifecycle action.');

      const [rows] = await pool.query(
        `SELECT p.*, ml.moderation_status
           FROM freelance_projects p
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          WHERE p.id = ? AND p.client_user_id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Project was not found.');
      const existing = rows[0];

      if (!PROJECT_STATUS_TRANSITIONS[existing.status]?.has(target)) {
        return sendError(res, 409, 'invalid_project_transition', 'This project cannot move to the requested status.');
      }
      let nextStatus = target;
      if (!['awarded', 'completed', 'cancelled', 'archived'].includes(target) &&
          existing.status !== 'archived') {
        const policy = await getModerationPolicy(pool, config);
        const candidate = target === 'published' && requiresReviewForType(policy, 'freelance_project') && existing.moderation_status !== 'approved'
          ? 'pending_review'
          : target;
        const transition = validateOwnerTransition({
          fromStatus: existing.status,
          toStatus: candidate,
          listingType: 'freelance_project',
          moderationPolicy: policy,
          moderationStatus: existing.moderation_status,
        });
        if (!transition.ok) return sendError(res, transition.status, transition.code, transition.message);
        nextStatus = transition.toStatus;
      }

      await withTransaction(pool, async (connection) => {
        await connection.query(
          'UPDATE freelance_projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_user_id = ?',
          [nextStatus, existing.id, req.auth.userId]
        );
        await syncMarketplaceListingStatus(connection, 'freelance_project', existing.id, nextStatus);
        await recordStatusHistory(connection, {
          listingId: existing.id,
          listingType: 'freelance_project',
          fromStatus: existing.status,
          toStatus: nextStatus,
          userId: req.auth.userId,
          role: existing.client_role || 'hiring',
          reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 240) : null,
        });
      });

      const [updated] = await pool.query(
        `SELECT p.*, u.name AS client_name FROM freelance_projects p LEFT JOIN users u ON u.id = p.client_user_id WHERE p.id = ? LIMIT 1`,
        [existing.id]
      );
      const [project] = await hydrateProjects(pool, updated);
      return res.json({ project });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Public & Provider Project Discovery ----
  router.get('/marketplace/projects', async (req, res, next) => {
    try {
      const {
        q,
        categoryId,
        subcategoryId,
        budgetType,
        minBudget,
        maxBudget,
        deadline,
        workMode,
        location,
        skills,
        sort = 'newest',
        limit = '20',
        page = '1',
      } = req.query;

      const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
      const pageNum = Math.max(1, Number(page) || 1);
      const offset = (pageNum - 1) * limitNum;
      const minBudgetNumber = minBudget === undefined || minBudget === '' ? null : Number(minBudget);
      const maxBudgetNumber = maxBudget === undefined || maxBudget === '' ? null : Number(maxBudget);
      if ((minBudgetNumber !== null && (!Number.isFinite(minBudgetNumber) || minBudgetNumber < 0)) ||
          (maxBudgetNumber !== null && (!Number.isFinite(maxBudgetNumber) || maxBudgetNumber < 0))) {
        return sendError(res, 400, 'validation_error', 'Budget filters must be non-negative numbers.');
      }
      if (minBudgetNumber !== null && maxBudgetNumber !== null && maxBudgetNumber < minBudgetNumber) {
        return sendError(res, 400, 'validation_error', 'Maximum budget filter must be at least the minimum budget.');
      }
      if (deadline && !isValidDateString(String(deadline))) {
        return sendError(res, 400, 'validation_error', 'Deadline filter must be a valid YYYY-MM-DD date.');
      }
      if (!['newest', 'budget_desc', 'budget_asc'].includes(String(sort))) {
        return sendError(res, 400, 'validation_error', 'Choose newest, budget_desc, or budget_asc.');
      }

      const params = [];
      let where = `WHERE p.status = 'published'
        AND p.is_active = TRUE
        AND p.visibility = 'public'
        AND (p.proposal_deadline IS NULL OR p.proposal_deadline >= CURDATE())
        AND EXISTS (
          SELECT 1 FROM marketplace_listings ml
           WHERE ml.id = p.id AND ml.listing_type = 'freelance_project'
             AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
        )`;

      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (p.title LIKE ? OR p.description LIKE ? OR p.deliverables LIKE ?)`;
        params.push(like, like, like);
      }
      if (categoryId) {
        where += ` AND p.category_id = ?`;
        params.push(String(categoryId).trim());
      }
      if (subcategoryId) {
        where += ` AND p.subcategory_id = ?`;
        params.push(String(subcategoryId).trim());
      }
      if (budgetType && VALID_BUDGET_TYPES.has(String(budgetType))) {
        where += ` AND p.budget_type = ?`;
        params.push(String(budgetType));
      }
      if (minBudgetNumber !== null) {
        where += ` AND COALESCE(p.budget_max, p.budget, 0) >= ?`;
        params.push(minBudgetNumber);
      }
      if (maxBudgetNumber !== null) {
        where += ` AND COALESCE(p.budget_min, p.budget, 0) <= ?`;
        params.push(maxBudgetNumber);
      }
      if (deadline) {
        where += ` AND p.deadline <= ?`;
        params.push(String(deadline).slice(0, 10));
      }
      if (workMode && VALID_WORK_MODES.has(String(workMode))) {
        where += ` AND p.work_mode = ?`;
        params.push(String(workMode));
      }
      if (location && String(location).trim()) {
        where += ` AND p.location LIKE ?`;
        params.push(`%${String(location).trim()}%`);
      }
      if (skills && String(skills).trim()) {
        const skillList = normalizeSkills(String(skills));
        if (skillList.length) {
          where += ` AND EXISTS (SELECT 1 FROM project_skills ps WHERE ps.project_id = p.id AND ps.skill IN (${skillList.map(() => '?').join(',')}))`;
          params.push(...skillList);
        }
      }

      const orderBy = sort === 'budget_desc'
        ? 'COALESCE(p.budget_max, p.budget, 0) DESC, p.created_at DESC'
        : sort === 'budget_asc'
          ? 'COALESCE(p.budget_min, p.budget, 0) ASC, p.created_at DESC'
          : 'p.created_at DESC';

      const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM freelance_projects p ${where}`, params);
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await pool.query(
        `SELECT p.*, u.name AS client_name
           FROM freelance_projects p
           LEFT JOIN users u ON u.id = p.client_user_id
          ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );

      const items = await hydrateProjects(pool, rows);
      return res.json({
        projects: items,
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(1, Math.ceil(total / limitNum)),
          hasMore: offset + items.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/projects/:id', async (req, res, next) => {
    try {
      const viewerId = await resolveOptionalUserId(req, authenticate);
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS client_name,
                ml.status AS listing_status, ml.is_public AS listing_is_public, ml.visibility AS listing_visibility
           FROM freelance_projects p
           LEFT JOIN users u ON u.id = p.client_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          WHERE p.id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'project_not_found', 'Project was not found.');

      const row = rows[0];
      const isPublic =
        row.status === 'published' &&
        Boolean(row.is_active) &&
        row.listing_status === 'published' &&
        Boolean(row.listing_is_public) &&
        row.listing_visibility === 'public';

      if (!isPublic && (!viewerId || viewerId !== row.client_user_id)) {
        return sendError(res, 404, 'project_not_found', 'Project was not found.');
      }

      const [project] = await hydrateProjects(pool, rows);
      let myProposal = null;
      let canSubmitProposal = false;
      if (viewerId) {
        const [propRows] = await pool.query(
          'SELECT id, status, proposed_amount, created_at FROM project_proposals WHERE project_id = ? AND proposer_user_id = ? LIMIT 1',
          [project.id, viewerId]
        );
        if (propRows.length) {
          myProposal = {
            id: propRows[0].id,
            status: propRows[0].status,
            proposedAmount: propRows[0].proposed_amount ? Number(propRows[0].proposed_amount) : null,
            createdAt: propRows[0].created_at,
          };
        }
        const proposer = await ensureProposerAccess(pool, viewerId, {
          businessProposalsEnabled: config.marketplace?.businessProjectProposalsEnabled === true,
        });
        canSubmitProposal = proposer.ok && viewerId !== project.clientUserId &&
          project.status === 'published' && project.isActive && !project.isProposalExpired;
      }

      return res.json({ project, myProposal, canSubmitProposal });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/projects/:id/attachments/:attachmentId/url', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT pa.object_key, p.client_user_id, p.status, p.is_active, p.visibility,
                ml.status AS listing_status, ml.is_public AS listing_is_public
           FROM project_attachments pa
           JOIN freelance_projects p ON p.id = pa.project_id
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          WHERE pa.id = ? AND pa.project_id = ?
          LIMIT 1`,
        [req.params.attachmentId, req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'attachment_not_found', 'Attachment was not found.');
      const attachment = rows[0];
      const isOwner = attachment.client_user_id === req.auth.userId;
      if (!isOwner) {
        const proposer = await ensureProposerAccess(pool, req.auth.userId, {
          businessProposalsEnabled: config.marketplace?.businessProjectProposalsEnabled === true,
        });
        if (!proposer.ok) return sendError(res, 403, proposer.code, proposer.message);
        const isPublic = attachment.status === 'published' && Boolean(attachment.is_active) &&
          attachment.visibility === 'public' && attachment.listing_status === 'published' &&
          Boolean(attachment.listing_is_public);
        if (!isPublic) return sendError(res, 404, 'attachment_not_found', 'Attachment was not found.');
      }
      if (!attachment.object_key) return sendError(res, 404, 'attachment_not_found', 'Attachment file is missing.');
      const url = await createPrivateReadUrl(config, attachment.object_key);
      if (!url) return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      return res.json({ url, expiresIn: config.uploadUrlTtlSeconds });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Proposals Workflow ----
  router.post('/marketplace/projects/:id/proposals', authenticate, async (req, res, next) => {
    try {
      const proposerCheck = await ensureProposerAccess(pool, req.auth.userId, {
        businessProposalsEnabled: config.marketplace?.businessProjectProposalsEnabled === true,
      });
      if (!proposerCheck.ok) return sendError(res, proposerCheck.status, proposerCheck.code, proposerCheck.message);

      const [projRows] = await pool.query(
        `SELECT p.*, ml.status AS listing_status
           FROM freelance_projects p
           LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
          WHERE p.id = ? AND p.status != 'deleted'
          LIMIT 1`,
        [req.params.id]
      );
      if (!projRows.length) return sendError(res, 404, 'project_not_found', 'Project was not found.');
      const proj = projRows[0];

      if (proj.client_user_id === req.auth.userId) {
        return sendError(res, 400, 'cannot_propose_own_project', 'You cannot submit a proposal to your own project.');
      }
      if (proj.status !== 'published' || !proj.is_active || proj.listing_status !== 'published') {
        return sendError(res, 409, 'project_not_open', 'This project is closed, awarded, or no longer accepting proposals.');
      }
      if (isDatePast(proj.proposal_deadline)) {
        return sendError(res, 409, 'proposal_deadline_passed', 'The proposal deadline for this project has passed.');
      }

      const [dupRows] = await pool.query(
        `SELECT id FROM project_proposals
          WHERE project_id = ? AND proposer_user_id = ? AND status != 'withdrawn'
          LIMIT 1`,
        [proj.id, req.auth.userId]
      );
      if (dupRows.length) {
        return sendError(res, 409, 'duplicate_proposal', 'You have already submitted an active proposal for this project.');
      }

      const body = req.body || {};
      if (body.milestones !== undefined && !Array.isArray(body.milestones)) {
        return sendError(res, 400, 'validation_error', 'Milestones must be a list.');
      }
      const cover = requiredText(body.coverMessage, 5000, 'Cover message');
      if (cover.error) return sendError(res, 400, 'validation_error', cover.error);

      const amount = optionalNumber(body.proposedAmount, 'Proposed amount', { min: 0 });
      if (amount.error) return sendError(res, 400, 'validation_error', amount.error);

      const timeline = optionalText(body.timelineText, 160, 'Timeline');
      if (timeline.error) return sendError(res, 400, 'validation_error', timeline.error);

      const attachmentIds = Array.isArray(body.attachmentMediaIds)
        ? [...new Set(body.attachmentMediaIds.filter((x) => typeof x === 'string' && x.trim()))]
        : [];
      if (attachmentIds.length > 5) {
        return sendError(res, 400, 'invalid_media', 'Attach at most 5 files to a proposal.');
      }

      let assetMap = new Map();
      if (attachmentIds.length) {
        const [assets] = await pool.query(
          `SELECT id, object_key, content_type, byte_size
             FROM media_assets
            WHERE user_id = ? AND role = ? AND purpose = 'proposal-attachment'
              AND status IN ('pending', 'attached')
              AND id IN (${attachmentIds.map(() => '?').join(',')})`,
          [req.auth.userId, proposerCheck.proposerRole, ...attachmentIds]
        );
        if (assets.length !== attachmentIds.length) {
          return sendError(res, 400, 'invalid_media', 'Proposal attachments must be uploaded by the proposer.');
        }
        assetMap = new Map(assets.map((a) => [a.id, a]));
      }

      const proposalId = randomUUID();
      const currency = String(body.currency || proj.currency || 'INR').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return sendError(res, 400, 'validation_error', 'Currency must be a three-letter currency code.');
      }
      const savedScreeningQuestions = parseJson(proj.screening_questions, []);
      const screeningQuestions = Array.isArray(savedScreeningQuestions) ? savedScreeningQuestions : [];
      const screeningAnswers = isRecord(body.answers?.screeningAnswers)
        ? body.answers.screeningAnswers
        : {};
      const normalizedAnswers = {};
      for (const question of screeningQuestions) {
        if (screeningAnswers[question] === undefined || screeningAnswers[question] === null) continue;
        const answer = optionalText(screeningAnswers[question], 2000, 'Screening answer');
        if (answer.error) return sendError(res, 400, 'validation_error', answer.error);
        normalizedAnswers[question] = answer.value;
      }
      normalizedAnswers.relevantSkills = normalizeSkills(
        body.relevantSkills ?? body.answers?.relevantSkills
      );
      const portfolioLinks = [];
      for (const rawLink of Array.isArray(body.portfolioLinks) ? body.portfolioLinks.slice(0, 5) : []) {
        const link = String(rawLink || '').trim();
        if (!link) continue;
        try {
          const parsed = new URL(link);
          if (!['http:', 'https:'].includes(parsed.protocol) || link.length > 2048) {
            return sendError(res, 400, 'validation_error', 'Portfolio links must be valid HTTP or HTTPS URLs.');
          }
        } catch {
          return sendError(res, 400, 'validation_error', 'Portfolio links must be valid HTTP or HTTPS URLs.');
        }
        portfolioLinks.push(link);
      }
      const rawMilestones = Array.isArray(body.milestones) ? body.milestones : [];
      if (rawMilestones.length > 20) {
        return sendError(res, 400, 'validation_error', 'A proposal can include at most 20 milestones.');
      }
      const milestones = [];
      for (const [index, rawMilestone] of rawMilestones.entries()) {
        if (!isRecord(rawMilestone)) {
          return sendError(res, 400, 'validation_error', 'Each milestone must include a title.');
        }
        const title = requiredText(rawMilestone.title, 180, 'Milestone title');
        const description = optionalText(rawMilestone.description, 2000, 'Milestone description');
        const estimatedDays = rawMilestone.estimatedDays === undefined || rawMilestone.estimatedDays === null ||
          rawMilestone.estimatedDays === ''
          ? null
          : Number(rawMilestone.estimatedDays);
        if (title.error || description.error || (estimatedDays !== null &&
            (!Number.isSafeInteger(estimatedDays) || estimatedDays < 1 || estimatedDays > 3650))) {
          return sendError(res, 400, 'validation_error', title.error || description.error || 'Milestone duration must be from 1 to 3650 days.');
        }
        milestones.push({ title: title.value, description: description.value, estimatedDays, sequence: index + 1 });
      }

      await withTransaction(pool, async (connection) => {
        const [lockedProjects] = await connection.query(
          `SELECT p.client_user_id, p.status, p.is_active, p.proposal_deadline,
                  ml.status AS listing_status
             FROM freelance_projects p
             LEFT JOIN marketplace_listings ml ON ml.id = p.id AND ml.listing_type = 'freelance_project'
            WHERE p.id = ? AND p.status != 'deleted'
            LIMIT 1 FOR UPDATE`,
          [proj.id]
        );
        const lockedProject = lockedProjects[0];
        if (!lockedProject || lockedProject.client_user_id === req.auth.userId ||
            lockedProject.status !== 'published' || !lockedProject.is_active ||
            lockedProject.listing_status !== 'published' || isDatePast(lockedProject.proposal_deadline)) {
          const error = new Error('Project is no longer accepting proposals.');
          error.code = 'PROJECT_NOT_OPEN';
          throw error;
        }

        const [activeProposals] = await connection.query(
          `SELECT id FROM project_proposals
            WHERE project_id = ? AND proposer_user_id = ?
            LIMIT 1`,
          [proj.id, req.auth.userId]
        );
        if (activeProposals.length) {
          const error = new Error('An active proposal already exists for this project.');
          error.code = 'DUPLICATE_PROPOSAL';
          throw error;
        }

        await connection.query(
          `INSERT INTO project_proposals (
             id, project_id, proposer_user_id, proposer_role, cover_message,
             proposed_amount, currency, timeline_text, answers, portfolio_links, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
          [
            proposalId,
            proj.id,
            req.auth.userId,
            proposerCheck.proposerRole,
            cover.value,
            amount.value,
            currency,
            timeline.value,
            JSON.stringify(normalizedAnswers),
            JSON.stringify(portfolioLinks),
          ]
        );
        for (const milestone of milestones) {
          await connection.query(
            `INSERT INTO proposal_milestones (
               id, proposal_id, title, description, sequence_no, estimated_days, status
             ) VALUES (?, ?, ?, ?, ?, ?, 'proposed')`,
            [
              randomUUID(),
              proposalId,
              milestone.title,
              milestone.description,
              milestone.sequence,
              milestone.estimatedDays,
            ]
          );
        }

        for (const assetId of attachmentIds) {
          const asset = assetMap.get(assetId);
          await connection.query(
            `INSERT INTO proposal_attachments (
               id, proposal_id, media_asset_id, file_name, mime_type, file_size, object_key
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [randomUUID(), proposalId, assetId, 'Proposal Attachment', asset.content_type || null, asset.byte_size || null, asset.object_key || null]
          );
          await connection.query(`UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ?`, [assetId]);
        }

        await connection.query(
          `INSERT INTO proposal_status_history (
             id, proposal_id, from_status, to_status, changed_by_user_id, changed_by_role, note
           ) VALUES (?, ?, NULL, 'submitted', ?, ?, ?)`,
          [randomUUID(), proposalId, req.auth.userId, proposerCheck.proposerRole, 'Proposal submitted']
        );
      });

      return res.status(201).json({
        proposal: {
          id: proposalId,
          projectId: proj.id,
          status: 'submitted',
          proposedAmount: amount.value,
          currency,
        },
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.code === 'DUPLICATE_PROPOSAL') {
        return sendError(res, 409, 'duplicate_proposal', 'You have already submitted an active proposal for this project.');
      }
      if (error.code === 'PROJECT_NOT_OPEN') {
        return sendError(res, 409, 'project_not_open', 'This project is closed, awarded, or no longer accepting proposals.');
      }
      return next(error);
    }
  });

  router.get('/marketplace/my-proposals', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT pp.*, p.title AS project_title, p.status AS project_status,
                p.work_mode, p.budget_type, u.name AS client_name
           FROM project_proposals pp
           JOIN freelance_projects p ON p.id = pp.project_id
           LEFT JOIN users u ON u.id = p.client_user_id
          WHERE pp.proposer_user_id = ?
          ORDER BY pp.created_at DESC
          LIMIT 50`,
        [req.auth.userId]
      );
      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          projectTitle: r.project_title,
          projectStatus: r.project_status,
          clientName: r.client_name || null,
          proposedAmount: r.proposed_amount ? Number(r.proposed_amount) : null,
          currency: r.currency || 'INR',
          timelineText: r.timeline_text || null,
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  async function listOwnerProposals(req, res, next, fixedProjectId = null) {
    try {
      const access = await ensureProjectPosterAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const projectId = fixedProjectId || (typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '');
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const pagination = paginationFromQuery(req.query, 50, 100);

      const params = [req.auth.userId];
      let where = 'WHERE p.client_user_id = ?';
      if (projectId) {
        where += ' AND pp.project_id = ?';
        params.push(projectId);
      }
      if (status && status !== 'all') {
        where += ' AND pp.status = ?';
        params.push(status);
      }

      const [rows] = await pool.query(
        `SELECT pp.*, p.title AS project_title, u.name AS proposer_name, u.email AS proposer_email
           FROM project_proposals pp
           JOIN freelance_projects p ON p.id = pp.project_id
           LEFT JOIN users u ON u.id = pp.proposer_user_id
          ${where}
          ORDER BY pp.created_at DESC
          LIMIT ? OFFSET ?`,
        [...params, pagination.limit, pagination.offset]
      );
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
           FROM project_proposals pp
           JOIN freelance_projects p ON p.id = pp.project_id
           ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);

      const propIds = rows.map((r) => r.id);
      const attMap = new Map();
      const milestoneMap = new Map();
      if (propIds.length) {
        const [attRows] = await pool.query(
          `SELECT id, proposal_id, media_asset_id, file_name, mime_type, file_size
             FROM proposal_attachments
            WHERE proposal_id IN (${propIds.map(() => '?').join(',')})`,
          propIds
        );
        for (const att of attRows) {
          if (!attMap.has(att.proposal_id)) attMap.set(att.proposal_id, []);
          attMap.get(att.proposal_id).push({
            id: att.id,
            mediaAssetId: att.media_asset_id,
            fileName: att.file_name || 'Attachment',
            mimeType: att.mime_type || null,
          });
        }
        const [milestoneRows] = await pool.query(
          `SELECT id, proposal_id, title, description, sequence_no, estimated_days, status
             FROM proposal_milestones
            WHERE proposal_id IN (${propIds.map(() => '?').join(',')})
            ORDER BY sequence_no`,
          propIds
        );
        for (const milestone of milestoneRows) {
          if (!milestoneMap.has(milestone.proposal_id)) milestoneMap.set(milestone.proposal_id, []);
          milestoneMap.get(milestone.proposal_id).push({
            id: milestone.id,
            title: milestone.title,
            description: milestone.description || null,
            sequence: Number(milestone.sequence_no),
            estimatedDays: milestone.estimated_days === null ? null : Number(milestone.estimated_days),
            status: milestone.status,
          });
        }
      }

      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          projectTitle: r.project_title,
          proposerUserId: r.proposer_user_id,
          proposerName: r.proposer_name || 'Proposer',
          proposerEmail: r.proposer_email || null,
          proposerRole: r.proposer_role,
          coverMessage: r.cover_message,
          proposedAmount: r.proposed_amount ? Number(r.proposed_amount) : null,
          currency: r.currency || 'INR',
          timelineText: r.timeline_text || null,
          portfolioLinks: parseJson(r.portfolio_links, []),
          relevantSkills: parseJson(r.answers, {})?.relevantSkills || [],
          milestones: milestoneMap.get(r.id) || [],
          status: r.status,
          internalNotes: r.internal_notes || null,
          attachments: attMap.get(r.id) || [],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
          hasMore: pagination.offset + rows.length < total,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  router.get('/marketplace/owner/proposals', authenticate, (req, res, next) =>
    listOwnerProposals(req, res, next)
  );
  router.get('/marketplace/projects/:id/proposals', authenticate, (req, res, next) =>
    listOwnerProposals(req, res, next, req.params.id)
  );

  router.patch('/marketplace/proposals/:id', authenticate, async (req, res, next) => {
    try {
      const access = await ensureProjectPosterAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const [rows] = await pool.query(
        `SELECT pp.*, p.client_user_id
           FROM project_proposals pp
           JOIN freelance_projects p ON p.id = pp.project_id
          WHERE pp.id = ? AND p.client_user_id = ?
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'proposal_not_found', 'Proposal was not found.');
      const existing = rows[0];
      const body = req.body || {};

      const nextStatus = body.status !== undefined ? String(body.status).trim() : existing.status;
      if (!VALID_PROPOSAL_STATUSES.has(nextStatus)) {
        return sendError(res, 400, 'validation_error', 'Select a valid proposal status.');
      }
      const allowedNextStatuses = {
        submitted: new Set(['submitted', 'shortlisted', 'selected', 'declined']),
        shortlisted: new Set(['shortlisted', 'selected', 'declined']),
        selected: new Set(['selected']),
        declined: new Set(['declined']),
      };
      if (!allowedNextStatuses[existing.status]?.has(nextStatus)) {
        return sendError(res, 409, 'invalid_proposal_transition', 'This proposal status cannot be changed to the selected status.');
      }
      const internalNotes = body.internalNotes !== undefined
        ? optionalText(body.internalNotes, 2000, 'Internal notes')
        : { value: existing.internal_notes };
      if (internalNotes.error) return sendError(res, 400, 'validation_error', internalNotes.error);

      await withTransaction(pool, async (connection) => {
        await connection.query(
          'SELECT id FROM freelance_projects WHERE id = ? AND client_user_id = ? FOR UPDATE',
          [existing.project_id, req.auth.userId]
        );
        if (nextStatus === 'selected') {
          const [selectedRows] = await connection.query(
            `SELECT id FROM project_proposals
              WHERE project_id = ? AND status = 'selected' AND id != ?
              LIMIT 1`,
            [existing.project_id, existing.id]
          );
          if (selectedRows.length) {
            const error = new Error('Another proposal has already been selected.');
            error.code = 'proposal_already_selected';
            throw error;
          }
        }
        await connection.query(
          `UPDATE project_proposals
              SET status = ?, internal_notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [nextStatus, internalNotes.value, existing.id]
        );
        if (nextStatus !== existing.status) {
          await connection.query(
            `INSERT INTO proposal_status_history (
               id, proposal_id, from_status, to_status, changed_by_user_id, changed_by_role, note
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              existing.id,
              existing.status,
              nextStatus,
              req.auth.userId,
              access.clientRole,
              typeof body.note === 'string' ? body.note.trim().slice(0, 240) : null,
            ]
          );
        }
      });

      return res.json({
        proposal: {
          id: existing.id,
          status: nextStatus,
          internalNotes: internalNotes.value,
        },
      });
    } catch (error) {
      if (error.code === 'proposal_already_selected') {
        return sendError(res, 409, 'proposal_already_selected', 'Choose only one selected proposal per project.');
      }
      return next(error);
    }
  });

  router.get('/marketplace/proposals/:id/attachments/:attachmentId/url', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT pa.object_key, pp.proposer_user_id, p.client_user_id
           FROM proposal_attachments pa
           JOIN project_proposals pp ON pp.id = pa.proposal_id
           JOIN freelance_projects p ON p.id = pp.project_id
          WHERE pa.id = ? AND pa.proposal_id = ?
          LIMIT 1`,
        [req.params.attachmentId, req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'attachment_not_found', 'Attachment was not found.');
      const row = rows[0];
      if (row.proposer_user_id !== req.auth.userId && row.client_user_id !== req.auth.userId) {
        return sendError(res, 403, 'forbidden_attachment', 'You are not authorized to access this private attachment.');
      }
      if (!row.object_key) return sendError(res, 404, 'attachment_not_found', 'Attachment file is missing.');
      const url = await createPrivateReadUrl(config, row.object_key);
      if (!url) return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      return res.json({ url, expiresIn: config.uploadUrlTtlSeconds });
    } catch (error) {
      return next(error);
    }
  });
}

