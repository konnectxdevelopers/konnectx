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

const JOB_ROOT_ID = '20000000-0000-4000-8000-000000000004';
const VALID_EMPLOYMENT_TYPES = new Set(['full-time', 'part-time', 'contract', 'temporary', 'internship']);
const VALID_WORK_MODES = new Set(['on-site', 'remote', 'hybrid']);
const VALID_APPLICATION_METHODS = new Set(['in_app', 'external_url', 'email']);
const VALID_APP_STATUSES = new Set([
  'submitted',
  'reviewing',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'withdrawn',
]);
const EMPLOYER_APPLICATION_TRANSITIONS = {
  submitted: new Set(['reviewing', 'shortlisted', 'rejected']),
  reviewing: new Set(['shortlisted', 'interviewing', 'rejected']),
  shortlisted: new Set(['interviewing', 'offered', 'rejected']),
  interviewing: new Set(['offered', 'rejected']),
  offered: new Set(['hired', 'rejected']),
  hired: new Set(),
  rejected: new Set(),
  withdrawn: new Set(),
};
const JOB_LIFECYCLE_ACTIONS = new Set([
  'save_draft',
  'submit',
  'publish',
  'pause',
  'resume',
  'close',
  'archive',
]);

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

function optionalNumber(value, fieldName, { min = 0, integer = false } = {}) {
  if (value === undefined || value === null || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > 100000000 || (integer && !Number.isInteger(n))) {
    return { error: `${fieldName} must be a valid ${integer ? 'integer' : 'number'}.` };
  }
  return { value: n };
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

function validateSkillsInput(raw) {
  if (typeof raw !== 'string' && !Array.isArray(raw)) {
    return { error: 'Required skills must be a comma-separated string or list.' };
  }
  const values = typeof raw === 'string'
    ? raw.split(',').map((skill) => skill.trim()).filter(Boolean)
    : raw;
  if (
    values.length > 30 ||
    values.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.trim().length > 80)
  ) {
    return { error: 'Add no more than 30 skills, each no longer than 80 characters.' };
  }
  return { value: [...new Set(values.map((skill) => skill.trim()))] };
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateOnlyValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

function isDeadlineExpired(deadline) {
  if (!deadline) return false;
  const dateOnly = dateOnlyValue(deadline);
  return isValidDateOnly(dateOnly) && dateOnly < new Date().toISOString().slice(0, 10);
}

function validateJobOwnerTransition({
  fromStatus,
  toStatus,
  moderationPolicy,
  moderationStatus,
}) {
  if (toStatus === 'closed') {
    return ['published', 'paused'].includes(fromStatus)
      ? { ok: true, toStatus }
      : { ok: false, status: 409, code: 'invalid_status_transition', message: 'Only published or paused jobs can be closed.' };
  }
  if (fromStatus === 'closed' && toStatus === 'archived') {
    return { ok: true, toStatus };
  }
  if (fromStatus === 'closed') {
    return { ok: false, status: 409, code: 'invalid_status_transition', message: 'Closed jobs cannot be reopened.' };
  }
  return validateOwnerTransition({
    fromStatus,
    toStatus,
    listingType: 'job',
    moderationPolicy,
    moderationStatus,
  });
}

function validateApplicationTarget(method, rawTarget) {
  const targetCheck = optionalText(rawTarget, 320, 'Application destination');
  if (targetCheck.error) return targetCheck;
  const target = targetCheck.value;
  if (method === 'in_app') return { value: null };
  if (!target) {
    return { error: 'An application destination is required for external applications.' };
  }
  if (method === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)
      ? { value: target }
      : { error: 'Enter a valid application email address.' };
  }
  try {
    const url = new URL(target);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      return { error: 'Enter a valid HTTP or HTTPS application URL.' };
    }
    return { value: url.toString() };
  } catch {
    return { error: 'Enter a valid HTTP or HTTPS application URL.' };
  }
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

async function ensureEmployerAccess(pool, userId, requestedRole = null) {
  const [roleRows] = await pool.query(
    `SELECT role, verification_status FROM user_roles
      WHERE user_id = ? AND role IN ('hiring', 'business')`,
    [userId]
  );
  const roleMap = new Map(roleRows.map((r) => [r.role, r]));

  if (requestedRole === 'hiring') {
    if (!roleMap.has('hiring')) {
      return { ok: false, status: 403, code: 'forbidden_role', message: 'Your account does not hold the hiring role.' };
    }
    const [hp] = await pool.query('SELECT profile FROM hiring_profiles WHERE user_id = ? LIMIT 1', [userId]);
    return { ok: true, employerRole: 'hiring', verificationStatus: roleMap.get('hiring').verification_status, profile: parseJson(hp[0]?.profile, {}) };
  }

  if (requestedRole === 'business') {
    if (!roleMap.has('business')) {
      return { ok: false, status: 403, code: 'forbidden_role', message: 'Your account does not hold the business role.' };
    }
    const [bp] = await pool.query('SELECT hiring_enabled, profile FROM business_profiles WHERE user_id = ? LIMIT 1', [userId]);
    if (!bp.length || !bp[0].hiring_enabled) {
      return { ok: false, status: 403, code: 'hiring_capability_disabled', message: 'Enable hiring capability on your business profile before posting jobs.' };
    }
    return { ok: true, employerRole: 'business', verificationStatus: roleMap.get('business').verification_status, profile: parseJson(bp[0]?.profile, {}) };
  }

  if (roleMap.has('hiring')) {
    const [hp] = await pool.query('SELECT profile FROM hiring_profiles WHERE user_id = ? LIMIT 1', [userId]);
    return { ok: true, employerRole: 'hiring', verificationStatus: roleMap.get('hiring').verification_status, profile: parseJson(hp[0]?.profile, {}) };
  }

  if (roleMap.has('business')) {
    const [bp] = await pool.query('SELECT hiring_enabled, profile FROM business_profiles WHERE user_id = ? LIMIT 1', [userId]);
    if (bp.length && bp[0].hiring_enabled) {
      return { ok: true, employerRole: 'business', verificationStatus: roleMap.get('business').verification_status, profile: parseJson(bp[0]?.profile, {}) };
    }
    return { ok: false, status: 403, code: 'hiring_capability_disabled', message: 'Enable hiring capability on your business profile before posting jobs.' };
  }

  return { ok: false, status: 403, code: 'forbidden_role', message: 'Only hiring accounts or hiring-enabled businesses can manage jobs.' };
}

async function validateJobCategorySelection(pool, categoryId, subcategoryId, { required = true } = {}) {
  if (!categoryId) {
    return required ? { ok: false, message: 'Select a job category.' } : { ok: true, categoryId: null, subcategoryId: null };
  }
  const cleanCat = String(categoryId).trim();
  const cleanSub = typeof subcategoryId === 'string' && subcategoryId.trim() ? subcategoryId.trim() : null;
  const [rows] = await pool.query(
    `SELECT c.id FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.id = ? AND c.is_active = TRUE
        AND (c.listing_type = 'job' OR parent.listing_type = 'job' OR c.parent_id = ?)
      LIMIT 1`,
    [cleanCat, JOB_ROOT_ID]
  );
  if (!rows.length) {
    return { ok: false, message: 'Select a valid job category.' };
  }
  if (cleanSub) {
    const [subRows] = await pool.query(
      'SELECT id FROM categories WHERE id = ? AND parent_id = ? AND is_active = TRUE LIMIT 1',
      [cleanSub, cleanCat]
    );
    if (!subRows.length) {
      return { ok: false, message: 'The selected subcategory does not belong to this job category.' };
    }
  }
  return { ok: true, categoryId: cleanCat, subcategoryId: cleanSub };
}

async function hydrateJobs(pool, rows) {
  if (!rows.length) return [];
  const jobIds = rows.map((r) => r.id);
  const placeholders = jobIds.map(() => '?').join(',');

  const [reqRows] = await pool.query(
    `SELECT * FROM job_requirements WHERE job_id IN (${placeholders}) ORDER BY created_at ASC`,
    jobIds
  );
  const reqMap = new Map();
  for (const r of reqRows) {
    if (!reqMap.has(r.job_id)) reqMap.set(r.job_id, []);
    reqMap.get(r.job_id).push({
      id: r.id,
      type: r.requirement_type,
      label: r.label,
      isMandatory: Boolean(r.is_mandatory),
    });
  }

  const [skillRows] = await pool.query(
    `SELECT job_id, skill FROM job_skills WHERE job_id IN (${placeholders})`,
    jobIds
  );
  const skillMap = new Map();
  for (const s of skillRows) {
    if (!skillMap.has(s.job_id)) skillMap.set(s.job_id, []);
    skillMap.get(s.job_id).push(s.skill);
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

  return rows.map((r) => {
    const employerDetails = parseJson(r.employer_details, null) || {};
    const skills = skillMap.get(r.id) || parseJson(r.skills, []);
    return {
      id: r.id,
      listingId: r.id,
      listingType: 'job',
      employerUserId: r.employer_user_id,
      employerRole: r.employer_role || 'hiring',
      employerName: employerDetails.companyName || r.employer_name || null,
      employerDetails,
      categoryId: r.category_id || null,
      categoryName: catNameMap.get(r.category_id) || null,
      subcategoryId: r.subcategory_id || null,
      subcategoryName: catNameMap.get(r.subcategory_id) || null,
      title: r.title,
      description: r.description || '',
      responsibilities: r.responsibilities || null,
      employmentType: r.employment_type || 'full-time',
      workMode: r.work_mode || 'on-site',
      location: r.location || null,
      experienceRequired: r.experience_required || null,
      experienceMin: r.experience_min === null || r.experience_min === undefined ? null : Number(r.experience_min),
      experienceMax: r.experience_max === null || r.experience_max === undefined ? null : Number(r.experience_max),
      educationRequired: r.education_required || null,
      salaryMin: r.salary_min === null || r.salary_min === undefined ? null : Number(r.salary_min),
      salaryMax: r.salary_max === null || r.salary_max === undefined ? null : Number(r.salary_max),
      salaryUndisclosed: Boolean(r.salary_undisclosed),
      currency: r.currency || 'INR',
      openings: Number(r.openings || 1),
      skills,
      requirements: reqMap.get(r.id) || [],
      deadline: r.deadline || null,
      isExpired: isDeadlineExpired(r.deadline),
      applicationMethod: r.application_method || 'in_app',
      applicationTarget: r.application_target || null,
      applicationQuestions: parseJson(r.application_questions, []),
      applicationCount: r.application_count !== undefined ? Number(r.application_count || 0) : undefined,
      isActive: r.is_active === undefined ? true : Boolean(r.is_active),
      status: r.status,
      moderationStatus: r.moderation_status || null,
      moderationReason: r.moderation_reason || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export function registerJobsRecruitmentRoutes(router, { pool, config, authenticate }) {
  // ---- Employer Job Management ----
  router.get('/marketplace/my-jobs', authenticate, async (req, res, next) => {
    try {
      const access = await ensureEmployerAccess(pool, req.auth.userId, req.query.role || null);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const params = [req.auth.userId];
      let where = `WHERE j.employer_user_id = ? AND j.status != 'deleted'`;
      if (statusFilter && statusFilter !== 'all') {
        where += ` AND j.status = ?`;
        params.push(statusFilter);
      }
      if (q) {
        const like = `%${q}%`;
        where += ` AND (j.title LIKE ? OR j.location LIKE ?)`;
        params.push(like, like);
      }

      const [rows] = await pool.query(
        `SELECT j.*, u.name AS employer_name,
                ml.moderation_status, ml.moderation_reason,
                (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
           FROM jobs j
           LEFT JOIN users u ON u.id = j.employer_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
          ${where}
          ORDER BY j.updated_at DESC
          LIMIT 50`,
        params
      );

      const [countRows] = await pool.query(
        `SELECT status, COUNT(*) AS count
           FROM jobs WHERE employer_user_id = ? AND status != 'deleted'
          GROUP BY status`,
        [req.auth.userId]
      );
      const countsByStatus = {
        all: 0,
        draft: 0,
        pending_review: 0,
        published: 0,
        paused: 0,
        closed: 0,
        rejected: 0,
        archived: 0,
      };
      for (const r of countRows) {
        countsByStatus[r.status] = Number(r.count || 0);
        countsByStatus.all += Number(r.count || 0);
      }

      const items = await hydrateJobs(pool, rows);
      return res.json({ items, countsByStatus });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/marketplace/my-jobs/:id', authenticate, async (req, res, next) => {
    try {
      const access = await ensureEmployerAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const [rows] = await pool.query(
        `SELECT j.*, u.name AS employer_name,
                ml.moderation_status, ml.moderation_reason,
                (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
           FROM jobs j
           LEFT JOIN users u ON u.id = j.employer_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
          WHERE j.id = ? AND j.employer_user_id = ? AND j.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Job was not found.');

      const [job] = await hydrateJobs(pool, rows);
      const [history] = await pool.query(
        `SELECT from_status, to_status, changed_by_role, reason, created_at
           FROM listing_status_history
          WHERE listing_id = ? AND listing_type = 'job'
          ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      );
      return res.json({ job, statusHistory: history });
    } catch (error) {
      return next(error);
    }
  });

  async function saveOrUpdateJob(req, res, next, { isCreate }) {
    try {
      const body = req.body || {};
      if (body.action !== undefined && !JOB_LIFECYCLE_ACTIONS.has(body.action)) {
        return sendError(res, 400, 'invalid_action', 'Invalid job lifecycle action.');
      }
      if (['pause', 'resume', 'close', 'archive'].includes(body.action)) {
        return sendError(res, 409, 'use_listing_lifecycle', 'Use the job transition endpoint to change status.');
      }
      const access = await ensureEmployerAccess(pool, req.auth.userId, body.employerRole || body.ownerRole || null);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      let existing = null;
      if (!isCreate) {
        const [rows] = await pool.query(
          `SELECT j.*, ml.moderation_status
             FROM jobs j
             LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
            WHERE j.id = ? AND j.employer_user_id = ? AND j.status != 'deleted'
            LIMIT 1`,
          [req.params.id, req.auth.userId]
        );
        if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Job was not found.');
        existing = rows[0];
        if (body.status !== undefined) {
          return sendError(res, 409, 'use_listing_lifecycle', 'Use the job transition endpoint to change status.');
        }
      }

      const action = typeof body.action === 'string' && JOB_LIFECYCLE_ACTIONS.has(body.action) ? body.action : null;
      const requestedStatusRaw = action === 'save_draft'
        ? 'draft'
        : action === 'submit'
          ? 'pending_review'
          : action === 'publish' || action === 'resume'
            ? 'published'
            : action === 'pause'
              ? 'paused'
              : action === 'close'
                ? 'closed'
                : action === 'archive'
                  ? 'archived'
                  : body.status;

      const policy = await getModerationPolicy(pool, config);
      let nextStatus = existing ? existing.status : (requestedStatusRaw === 'published' ? 'published' : 'draft');
      if (isCreate) {
        if (requestedStatusRaw === 'pending_review') {
          nextStatus = 'pending_review';
        } else if (requestedStatusRaw === 'published') {
          if (requiresReviewForType(policy, 'job')) {
            if (!action) {
              return sendError(res, 409, 'review_required', 'This job requires moderation review before publishing.');
            }
            nextStatus = 'pending_review';
          } else {
            nextStatus = 'published';
          }
        } else {
          nextStatus = 'draft';
        }
      } else if (requestedStatusRaw !== undefined && requestedStatusRaw !== existing.status) {
        const candidateStatus = requestedStatusRaw === 'published' && requiresReviewForType(policy, 'job') && existing.moderation_status !== 'approved'
          ? 'pending_review'
          : requestedStatusRaw;
        const transition = validateJobOwnerTransition({
          fromStatus: existing.status,
          toStatus: candidateStatus,
          moderationPolicy: policy,
          moderationStatus: existing.moderation_status,
        });
        if (!transition.ok) return sendError(res, transition.status, transition.code, transition.message);
        nextStatus = transition.toStatus;
      }

      const isDraft = nextStatus === 'draft';
      const titleCheck = body.title !== undefined || isCreate ? requiredText(body.title, 180, 'Job title') : { value: existing.title };
      if (titleCheck.error) return sendError(res, 400, 'validation_error', titleCheck.error);

      const descRaw = body.description !== undefined ? body.description : existing?.description;
      const descCheck = isDraft ? optionalText(descRaw || null, 10000, 'Description') : requiredText(descRaw, 10000, 'Description');
      if (descCheck.error) return sendError(res, 400, 'validation_error', descCheck.error);

      const respCheck = body.responsibilities !== undefined
        ? optionalText(body.responsibilities, 5000, 'Responsibilities')
        : { value: existing?.responsibilities || null };
      if (respCheck.error) return sendError(res, 400, 'validation_error', respCheck.error);

      const employmentType = body.employmentType || existing?.employment_type || 'full-time';
      if (!VALID_EMPLOYMENT_TYPES.has(employmentType)) {
        return sendError(res, 400, 'validation_error', 'Select a valid employment type.');
      }
      const workMode = body.workMode || existing?.work_mode || 'on-site';
      if (!VALID_WORK_MODES.has(workMode)) {
        return sendError(res, 400, 'validation_error', 'Select a valid work mode.');
      }

      const catCheck = await validateJobCategorySelection(
        pool,
        body.categoryId !== undefined ? body.categoryId : existing?.category_id,
        body.subcategoryId !== undefined ? body.subcategoryId : existing?.subcategory_id,
        { required: !isDraft }
      );
      if (!catCheck.ok) return sendError(res, 400, 'invalid_category', catCheck.message);

      const salMin = optionalNumber(body.salaryMin !== undefined ? body.salaryMin : existing?.salary_min, 'Minimum salary', { min: 0 });
      const salMax = optionalNumber(body.salaryMax !== undefined ? body.salaryMax : existing?.salary_max, 'Maximum salary', { min: 0 });
      if (salMin.error || salMax.error) return sendError(res, 400, 'validation_error', salMin.error || salMax.error);
      if (salMin.value !== null && salMax.value !== null && salMax.value < salMin.value) {
        return sendError(res, 400, 'validation_error', 'Maximum salary must be greater than or equal to minimum salary.');
      }

      const expMin = optionalNumber(body.experienceMin !== undefined ? body.experienceMin : existing?.experience_min, 'Minimum experience', { min: 0, integer: true });
      const expMax = optionalNumber(body.experienceMax !== undefined ? body.experienceMax : existing?.experience_max, 'Maximum experience', { min: 0, integer: true });
      if (expMin.error || expMax.error) return sendError(res, 400, 'validation_error', expMin.error || expMax.error);
      if (expMin.value !== null && expMax.value !== null && expMax.value < expMin.value) {
        return sendError(res, 400, 'validation_error', 'Maximum experience must be greater than or equal to minimum experience.');
      }

      const openings = optionalNumber(body.openings !== undefined ? body.openings : existing?.openings ?? 1, 'Openings', { min: 1, integer: true });
      if (openings.error) return sendError(res, 400, 'validation_error', openings.error);

      const deadlineVal = body.deadline !== undefined
        ? (body.deadline === '' || body.deadline === null ? null : body.deadline)
        : dateOnlyValue(existing?.deadline);
      if (deadlineVal !== null && typeof deadlineVal !== 'string') {
        return sendError(res, 400, 'validation_error', 'Application deadline must be a YYYY-MM-DD date.');
      }
      if (deadlineVal && !isValidDateOnly(deadlineVal)) {
        return sendError(res, 400, 'validation_error', 'Application deadline must be a valid YYYY-MM-DD date.');
      }
      if (deadlineVal && nextStatus !== 'draft' && isDeadlineExpired(deadlineVal)) {
        return sendError(res, 400, 'validation_error', 'Application deadline must be today or a future date.');
      }

      const appMethod = body.applicationMethod || existing?.application_method || 'in_app';
      if (!VALID_APPLICATION_METHODS.has(appMethod)) {
        return sendError(res, 400, 'validation_error', 'Select a valid application method.');
      }
      const applicationTarget = validateApplicationTarget(
        appMethod,
        body.applicationTarget !== undefined ? body.applicationTarget : existing?.application_target
      );
      if (applicationTarget.error) return sendError(res, 400, 'validation_error', applicationTarget.error);

      const skillsCheck = body.skills !== undefined
        ? validateSkillsInput(body.skills)
        : { value: parseJson(existing?.skills, []) };
      if (skillsCheck.error) return sendError(res, 400, 'validation_error', skillsCheck.error);
      const skills = skillsCheck.value;
      const locationText = body.location !== undefined ? optionalText(body.location, 160, 'Location') : { value: existing?.location || null };
      if (locationText.error) return sendError(res, 400, 'validation_error', locationText.error);

      const expText = body.experienceRequired !== undefined
        ? optionalText(body.experienceRequired, 80, 'Experience summary')
        : { value: existing?.experience_required || null };
      const eduText = body.educationRequired !== undefined
        ? optionalText(body.educationRequired, 120, 'Qualification')
        : { value: existing?.education_required || null };
      if (expText.error || eduText.error) return sendError(res, 400, 'validation_error', expText.error || eduText.error);

      const employerDetails = {
        companyName: access.profile?.companyName || access.profile?.fullName || null,
        city: access.profile?.city || null,
        industry: access.profile?.industry || null,
        employerRole: access.employerRole,
      };
      if (body.salaryUndisclosed !== undefined && typeof body.salaryUndisclosed !== 'boolean') {
        return sendError(res, 400, 'validation_error', 'Salary disclosure must be true or false.');
      }
      const salaryUndisclosed = body.salaryUndisclosed !== undefined
        ? body.salaryUndisclosed
        : Boolean(existing?.salary_undisclosed);
      const currency = String(body.currency || existing?.currency || 'INR').slice(0, 8);
      if (!/^[A-Z]{3}$/.test(currency)) {
        return sendError(res, 400, 'validation_error', 'Select a valid three-letter currency code.');
      }
      const appQuestions = Array.isArray(body.applicationQuestions)
        ? body.applicationQuestions
        : parseJson(existing?.application_questions, []);
      if (
        !Array.isArray(appQuestions) ||
        appQuestions.length > 10 ||
        appQuestions.some((question) => typeof question !== 'string' || !question.trim() || question.trim().length > 250)
      ) {
        return sendError(res, 400, 'validation_error', 'Add no more than 10 application questions, each up to 250 characters.');
      }
      if (
        body.requirements !== undefined &&
        (!Array.isArray(body.requirements) ||
          body.requirements.length > 20 ||
          body.requirements.some((item) =>
            !isRecord(item) ||
            typeof item.label !== 'string' ||
            !item.label.trim() ||
            item.label.trim().length > 255 ||
            (item.type !== undefined && (typeof item.type !== 'string' || item.type.length > 32)) ||
            (item.isMandatory !== undefined && typeof item.isMandatory !== 'boolean')
          ))
      ) {
        return sendError(res, 400, 'validation_error', 'Job requirements must contain up to 20 valid requirement entries.');
      }
      const requirements = body.requirements === undefined ? null : body.requirements;

      const jobId = existing ? existing.id : randomUUID();

      await withTransaction(pool, async (connection) => {
        if (isCreate) {
          await connection.query(
            `INSERT INTO jobs (
               id, employer_user_id, employer_role, category_id, subcategory_id, title,
               description, responsibilities, employment_type, work_mode, location,
               salary_min, salary_max, salary_undisclosed, currency,
               experience_required, experience_min, experience_max, education_required,
               skills, openings, deadline, application_method, application_target, application_questions,
               employer_details, is_active, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              jobId, req.auth.userId, access.employerRole, catCheck.categoryId, catCheck.subcategoryId,
              titleCheck.value, descCheck.value || '', respCheck.value, employmentType, workMode,
              locationText.value, salMin.value, salMax.value, salaryUndisclosed ? 1 : 0, currency,
              expText.value, expMin.value, expMax.value, eduText.value,
              JSON.stringify(skills), openings.value || 1, deadlineVal, appMethod,
              applicationTarget.value, JSON.stringify(appQuestions), JSON.stringify(employerDetails), 1, nextStatus,
            ]
          );
        } else {
          await connection.query(
            `UPDATE jobs
                SET category_id = ?, subcategory_id = ?, title = ?, description = ?,
                    responsibilities = ?, employment_type = ?, work_mode = ?, location = ?,
                    salary_min = ?, salary_max = ?, salary_undisclosed = ?, currency = ?,
                    experience_required = ?, experience_min = ?, experience_max = ?,
                    education_required = ?, skills = ?, openings = ?, deadline = ?,
                    application_method = ?, application_target = ?, application_questions = ?, employer_details = ?,
                    status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND employer_user_id = ?`,
            [
              catCheck.categoryId, catCheck.subcategoryId, titleCheck.value, descCheck.value || '',
              respCheck.value, employmentType, workMode, locationText.value,
              salMin.value, salMax.value, salaryUndisclosed ? 1 : 0, currency,
              expText.value, expMin.value, expMax.value, eduText.value,
              JSON.stringify(skills), openings.value || 1, deadlineVal,
              appMethod, applicationTarget.value, JSON.stringify(appQuestions), JSON.stringify(employerDetails),
              nextStatus, jobId, req.auth.userId,
            ]
          );
        }

        await connection.query('DELETE FROM job_skills WHERE job_id = ?', [jobId]);
        for (const skill of skills) {
          await connection.query('INSERT IGNORE INTO job_skills (job_id, skill) VALUES (?, ?)', [jobId, skill.slice(0, 80)]);
        }

        if (requirements !== null) {
          await connection.query('DELETE FROM job_requirements WHERE job_id = ?', [jobId]);
          for (const reqItem of requirements) {
            await connection.query(
              `INSERT INTO job_requirements (id, job_id, requirement_type, label, is_mandatory)
               VALUES (?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                jobId,
                String(reqItem.type || 'qualification').slice(0, 32),
                String(reqItem.label).trim().slice(0, 255),
                reqItem.isMandatory !== false ? 1 : 0,
              ]
            );
          }
        }

        await syncMarketplaceListing(connection, {
          id: jobId,
          type: 'job',
          ownerId: req.auth.userId,
          ownerRole: access.employerRole,
          categoryId: catCheck.categoryId,
          subcategoryId: catCheck.subcategoryId,
          title: titleCheck.value,
          shortSummary: (descCheck.value || titleCheck.value).slice(0, 240),
          description: descCheck.value || '',
          location: locationText.value ? { city: locationText.value, workMode } : { workMode },
          visibility: 'public',
          status: nextStatus,
        });

        if (isCreate || nextStatus !== existing.status) {
          await recordStatusHistory(connection, {
            listingId: jobId,
            listingType: 'job',
            fromStatus: existing ? existing.status : null,
            toStatus: nextStatus,
            userId: req.auth.userId,
            role: access.employerRole,
          });
        }
      });

      const [saved] = await pool.query(
        `SELECT j.*, u.name AS employer_name FROM jobs j
           LEFT JOIN users u ON u.id = j.employer_user_id
          WHERE j.id = ? LIMIT 1`,
        [jobId]
      );
      const [hydrated] = await hydrateJobs(pool, saved);
      return res.status(isCreate ? 201 : 200).json({ job: hydrated });
    } catch (error) {
      return next(error);
    }
  }

  router.post('/marketplace/jobs', authenticate, (req, res, next) =>
    saveOrUpdateJob(req, res, next, { isCreate: true })
  );
  router.put('/marketplace/jobs/:id', authenticate, (req, res, next) =>
    saveOrUpdateJob(req, res, next, { isCreate: false })
  );
  router.patch('/marketplace/jobs/:id', authenticate, (req, res, next) =>
    saveOrUpdateJob(req, res, next, { isCreate: false })
  );

  router.post('/marketplace/jobs/:id/transition', authenticate, async (req, res, next) => {
    try {
      const access = await ensureEmployerAccess(pool, req.auth.userId);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);

      const action = String(req.body?.action || '').trim();
      const map = {
        save_draft: 'draft',
        submit: 'pending_review',
        publish: 'published',
        resume: 'published',
        pause: 'paused',
        close: 'closed',
        archive: 'archived',
      };
      const target = map[action];
      if (!target) return sendError(res, 400, 'invalid_action', 'Invalid job lifecycle action.');

      const [rows] = await pool.query(
        `SELECT j.*, ml.moderation_status
           FROM jobs j
           LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
          WHERE j.id = ? AND j.employer_user_id = ? AND j.status != 'deleted'
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'listing_not_found', 'Job was not found.');
      const existing = rows[0];
      if (target === 'published' && isDeadlineExpired(existing.deadline)) {
        return sendError(res, 409, 'job_expired', 'Update the application deadline before publishing this job.');
      }

      let nextStatus = target;
      const policy = await getModerationPolicy(pool, config);
      const candidate = target === 'published' && requiresReviewForType(policy, 'job') && existing.moderation_status !== 'approved'
        ? 'pending_review'
        : target;
      const transition = validateJobOwnerTransition({
        fromStatus: existing.status,
        toStatus: candidate,
        moderationPolicy: policy,
        moderationStatus: existing.moderation_status,
      });
      if (!transition.ok) return sendError(res, transition.status, transition.code, transition.message);
      nextStatus = transition.toStatus;

      await withTransaction(pool, async (connection) => {
        await connection.query(
          'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND employer_user_id = ?',
          [nextStatus, existing.id, req.auth.userId]
        );
        await syncMarketplaceListingStatus(connection, 'job', existing.id, nextStatus);
        await recordStatusHistory(connection, {
          listingId: existing.id,
          listingType: 'job',
          fromStatus: existing.status,
          toStatus: nextStatus,
          userId: req.auth.userId,
          role: existing.employer_role || 'hiring',
          reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 240) : null,
        });
      });

      const [updated] = await pool.query(
        `SELECT j.*, u.name AS employer_name FROM jobs j LEFT JOIN users u ON u.id = j.employer_user_id WHERE j.id = ? LIMIT 1`,
        [existing.id]
      );
      const [job] = await hydrateJobs(pool, updated);
      return res.json({ job });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Customer Public Job Discovery & Detail ----
  router.get('/marketplace/jobs', async (req, res, next) => {
    try {
      const {
        q,
        categoryId,
        subcategoryId,
        employmentType,
        workMode,
        location,
        experienceMax,
        minSalary,
        maxSalary,
        skills,
        education,
        postedWithin,
        sort = 'newest',
        limit = '20',
        page = '1',
      } = req.query;

      if (employmentType && !VALID_EMPLOYMENT_TYPES.has(String(employmentType))) {
        return sendError(res, 400, 'invalid_filter', 'Select a valid employment type filter.');
      }
      if (workMode && !VALID_WORK_MODES.has(String(workMode))) {
        return sendError(res, 400, 'invalid_filter', 'Select a valid work mode filter.');
      }
      if (!['newest', 'salary_desc', 'salary_asc'].includes(String(sort))) {
        return sendError(res, 400, 'invalid_filter', 'Select a valid job sort order.');
      }
      const minSalaryNum = minSalary === undefined || minSalary === '' ? null : Number(minSalary);
      const maxSalaryNum = maxSalary === undefined || maxSalary === '' ? null : Number(maxSalary);
      if (
        (minSalaryNum !== null && (!Number.isFinite(minSalaryNum) || minSalaryNum < 0)) ||
        (maxSalaryNum !== null && (!Number.isFinite(maxSalaryNum) || maxSalaryNum < 0)) ||
        (minSalaryNum !== null && maxSalaryNum !== null && minSalaryNum > maxSalaryNum)
      ) {
        return sendError(res, 400, 'invalid_filter', 'Enter a valid salary range.');
      }
      if (postedWithin && !['24h', '7d', '30d'].includes(String(postedWithin))) {
        return sendError(res, 400, 'invalid_filter', 'Select a valid posted-date filter.');
      }

      const limitNum = Math.min(50, Math.max(1, Math.trunc(Number(limit)) || 20));
      const pageNum = Math.min(100000, Math.max(1, Math.trunc(Number(page)) || 1));
      const offset = (pageNum - 1) * limitNum;

      const params = [];
      let where = `WHERE j.status = 'published'
        AND j.is_active = TRUE
        AND (j.deadline IS NULL OR j.deadline >= CURDATE())
        AND EXISTS (
          SELECT 1 FROM marketplace_listings ml
           WHERE ml.id = j.id AND ml.listing_type = 'job'
             AND ml.status = 'published' AND ml.is_public = TRUE AND ml.visibility = 'public'
             AND ml.moderation_status IN ('not_required', 'approved')
        )`;

      if (q && String(q).trim()) {
        const like = `%${String(q).trim()}%`;
        where += ` AND (j.title LIKE ? OR j.description LIKE ? OR j.location LIKE ? OR u.name LIKE ?)`;
        params.push(like, like, like, like);
      }
      if (categoryId) {
        where += ` AND j.category_id = ?`;
        params.push(String(categoryId).trim());
      }
      if (subcategoryId) {
        where += ` AND j.subcategory_id = ?`;
        params.push(String(subcategoryId).trim());
      }
      if (employmentType && VALID_EMPLOYMENT_TYPES.has(String(employmentType))) {
        where += ` AND j.employment_type = ?`;
        params.push(String(employmentType));
      }
      if (workMode && VALID_WORK_MODES.has(String(workMode))) {
        where += ` AND j.work_mode = ?`;
        params.push(String(workMode));
      }
      if (location && String(location).trim()) {
        where += ` AND j.location LIKE ?`;
        params.push(`%${String(location).trim()}%`);
      }
      if (experienceMax !== undefined && experienceMax !== '' && Number.isFinite(Number(experienceMax))) {
        where += ` AND (j.experience_min IS NULL OR j.experience_min <= ?)`;
        params.push(Number(experienceMax));
      }
      if (minSalaryNum !== null || maxSalaryNum !== null) {
        where += ` AND j.salary_undisclosed = FALSE
          AND (j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL)`;
        if (minSalaryNum !== null) {
          where += ` AND (j.salary_max IS NULL OR j.salary_max >= ?)`;
          params.push(minSalaryNum);
        }
        if (maxSalaryNum !== null) {
          where += ` AND (j.salary_min IS NULL OR j.salary_min <= ?)`;
          params.push(maxSalaryNum);
        }
      }
      if (education && String(education).trim()) {
        where += ` AND j.education_required LIKE ?`;
        params.push(`%${String(education).trim()}%`);
      }
      if (skills && String(skills).trim()) {
        const skillList = normalizeSkills(String(skills));
        if (skillList.length) {
          where += ` AND EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = j.id AND js.skill IN (${skillList.map(() => '?').join(',')}))`;
          params.push(...skillList);
        }
      }
      if (postedWithin === '24h') {
        where += ` AND j.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`;
      } else if (postedWithin === '7d') {
        where += ` AND j.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
      } else if (postedWithin === '30d') {
        where += ` AND j.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      }

      const orderBy = sort === 'salary_desc'
        ? 'COALESCE(j.salary_max, j.salary_min, 0) DESC, j.created_at DESC'
        : sort === 'salary_asc'
          ? 'COALESCE(j.salary_min, j.salary_max, 0) ASC, j.created_at DESC'
          : 'j.created_at DESC';

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM jobs j LEFT JOIN users u ON u.id = j.employer_user_id ${where}`,
        params
      );
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await pool.query(
        `SELECT j.*, u.name AS employer_name
           FROM jobs j
           LEFT JOIN users u ON u.id = j.employer_user_id
          ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );

      const items = await hydrateJobs(pool, rows);
      return res.json({
        jobs: items,
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

  router.get('/marketplace/jobs/:id', async (req, res, next) => {
    try {
      const viewerId = await resolveOptionalUserId(req, authenticate);
      const [rows] = await pool.query(
        `SELECT j.*, u.name AS employer_name,
                ml.status AS listing_status, ml.is_public AS listing_is_public,
                ml.visibility AS listing_visibility, ml.moderation_status AS listing_moderation_status
           FROM jobs j
           LEFT JOIN users u ON u.id = j.employer_user_id
           LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
          WHERE j.id = ? AND j.status != 'deleted'
          LIMIT 1`,
        [req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'job_not_found', 'Job was not found.');

      const row = rows[0];
      const isPublic =
        row.status === 'published' &&
        Boolean(row.is_active) &&
        row.listing_status === 'published' &&
        Boolean(row.listing_is_public) &&
        row.listing_visibility === 'public' &&
        ['not_required', 'approved'].includes(row.listing_moderation_status) &&
        !isDeadlineExpired(row.deadline);

      if (!isPublic && (!viewerId || viewerId !== row.employer_user_id)) {
        return sendError(res, 404, 'job_not_found', 'Job was not found.');
      }

      const [job] = await hydrateJobs(pool, rows);
      let myApplication = null;
      if (viewerId) {
        const [appRows] = await pool.query(
          'SELECT id, status, applied_at FROM applications WHERE job_id = ? AND applicant_user_id = ? LIMIT 1',
          [job.id, viewerId]
        );
        if (appRows.length) {
          myApplication = {
            id: appRows[0].id,
            status: appRows[0].status,
            appliedAt: appRows[0].applied_at,
          };
        }
      }

      return res.json({ job, myApplication });
    } catch (error) {
      return next(error);
    }
  });

  // ---- Applications & Recruitment Workflow ----
  router.post('/marketplace/jobs/:id/apply', authenticate, async (req, res, next) => {
    try {
      const [jobRows] = await pool.query(
        `SELECT j.*, ml.status AS listing_status, ml.is_public AS listing_is_public,
                ml.visibility AS listing_visibility, ml.moderation_status AS listing_moderation_status
           FROM jobs j
           LEFT JOIN marketplace_listings ml ON ml.id = j.id AND ml.listing_type = 'job'
          WHERE j.id = ? AND j.status != 'deleted'
          LIMIT 1`,
        [req.params.id]
      );
      if (!jobRows.length) return sendError(res, 404, 'job_not_found', 'Job was not found.');
      const job = jobRows[0];

      if (job.employer_user_id === req.auth.userId) {
        return sendError(res, 400, 'cannot_apply_own_job', 'You cannot apply to your own job post.');
      }
      if (
        job.status !== 'published' ||
        !job.is_active ||
        job.listing_status !== 'published' ||
        !job.listing_is_public ||
        job.listing_visibility !== 'public' ||
        !['not_required', 'approved'].includes(job.listing_moderation_status)
      ) {
        return sendError(res, 409, 'job_not_accepting_applications', 'This job is closed or no longer accepting applications.');
      }
      if (job.application_method !== 'in_app') {
        return sendError(res, 409, 'external_application', 'This job accepts applications outside KonnectX.');
      }
      if (isDeadlineExpired(job.deadline)) {
        return sendError(res, 409, 'job_expired', 'The application deadline for this job has passed.');
      }

      const [dupRows] = await pool.query(
        'SELECT id FROM applications WHERE job_id = ? AND applicant_user_id = ? LIMIT 1',
        [job.id, req.auth.userId]
      );
      if (dupRows.length) {
        return sendError(res, 409, 'duplicate_application', 'You have already applied to this job.');
      }

      const body = req.body || {};
      const coverNote = optionalText(body.coverNote, 4000, 'Cover note');
      if (coverNote.error) return sendError(res, 400, 'validation_error', coverNote.error);

      const attachmentIds = Array.isArray(body.attachmentMediaIds)
        ? body.attachmentMediaIds.filter((x) => typeof x === 'string' && x.trim())
        : [];
      const resumeMediaId = typeof body.resumeMediaId === 'string' && body.resumeMediaId.trim()
        ? body.resumeMediaId.trim()
        : null;
      const allAssetIds = [...new Set([...(resumeMediaId ? [resumeMediaId] : []), ...attachmentIds])];
      if (allAssetIds.length > 5) {
        return sendError(res, 400, 'invalid_media', 'Attach at most 5 resume/document files.');
      }

      let assetMap = new Map();
      if (allAssetIds.length) {
        const [assets] = await pool.query(
          `SELECT id, object_key, content_type, byte_size, purpose
             FROM media_assets
            WHERE user_id = ? AND id IN (${allAssetIds.map(() => '?').join(',')})`,
          [req.auth.userId, ...allAssetIds]
        );
        if (assets.length !== allAssetIds.length) {
          return sendError(res, 400, 'invalid_media', 'Attachments must be uploaded by the applicant.');
        }
        if (assets.some((asset) =>
          asset.purpose !== 'application-resume' ||
          !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(asset.content_type) ||
          Number(asset.byte_size) > config.maxUploadBytes
        )) {
          return sendError(res, 400, 'invalid_media', 'Only supported resume files within the upload size limit may be attached.');
        }
        assetMap = new Map(assets.map((a) => [a.id, a]));
      }

      if (body.answers !== undefined && !isRecord(body.answers)) {
        return sendError(res, 400, 'validation_error', 'Application answers must be an object.');
      }
      const answers = body.answers || {};
      if (
        Object.keys(answers).length > 10 ||
        Object.values(answers).some((answer) => typeof answer !== 'string' || answer.length > 2000)
      ) {
        return sendError(res, 400, 'validation_error', 'Provide up to 10 text answers, each no longer than 2,000 characters.');
      }

      const [roleRow] = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = ? ORDER BY is_primary DESC LIMIT 1',
        [req.auth.userId]
      );
      const applicantRole = roleRow[0]?.role || 'customer';
      const applicationId = randomUUID();

      await withTransaction(pool, async (connection) => {
        await connection.query(
          `INSERT INTO applications (
             id, job_id, applicant_user_id, applicant_role, cover_note, answers, resume_media_id, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
          [
            applicationId,
            job.id,
            req.auth.userId,
            applicantRole,
            coverNote.value,
            JSON.stringify(answers),
            resumeMediaId,
          ]
        );

        for (const assetId of allAssetIds) {
          const asset = assetMap.get(assetId);
          await connection.query(
            `INSERT INTO application_attachments (
               id, application_id, media_asset_id, file_name, mime_type, file_size, object_key
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              applicationId,
              assetId,
              assetId === resumeMediaId ? 'Resume' : 'Attachment',
              asset.content_type || null,
              asset.byte_size || null,
              asset.object_key || null,
            ]
          );
          await connection.query(`UPDATE media_assets SET status = 'attached', expires_at = NULL WHERE id = ?`, [assetId]);
        }

        await connection.query(
          `INSERT INTO application_status_history (
             id, application_id, from_status, to_status, changed_by_user_id, changed_by_role, note
           ) VALUES (?, ?, NULL, 'submitted', ?, ?, ?)`,
          [randomUUID(), applicationId, req.auth.userId, applicantRole, 'Application submitted']
        );
      });

      return res.status(201).json({
        application: {
          id: applicationId,
          jobId: job.id,
          status: 'submitted',
          applicantUserId: req.auth.userId,
        },
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendError(res, 409, 'duplicate_application', 'You have already applied to this job.');
      }
      return next(error);
    }
  });

  router.get('/marketplace/my-applications', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.*, j.title AS job_title, j.location AS job_location,
                j.work_mode, j.employment_type, j.status AS job_status,
                j.employer_details, u.name AS employer_name
           FROM applications a
           JOIN jobs j ON j.id = a.job_id
           LEFT JOIN users u ON u.id = j.employer_user_id
          WHERE a.applicant_user_id = ?
          ORDER BY a.applied_at DESC
          LIMIT 50`,
        [req.auth.userId]
      );
      return res.json({
        items: rows.map((r) => {
          const emp = parseJson(r.employer_details, {}) || {};
          return {
            id: r.id,
            jobId: r.job_id,
            jobTitle: r.job_title,
            jobLocation: r.job_location || null,
            workMode: r.work_mode,
            employmentType: r.employment_type,
            jobStatus: r.job_status,
            employerName: emp.companyName || r.employer_name || null,
            status: r.status,
            interviewStage: r.interview_stage || null,
            coverNote: r.cover_note || null,
            appliedAt: r.applied_at,
            updatedAt: r.updated_at,
          };
        }),
      });
    } catch (error) {
      return next(error);
    }
  });

  async function listEmployerApplications(req, res, next, fixedJobId = null) {
    try {
      const requestedRole = typeof req.query.role === 'string' ? req.query.role.trim() : null;
      if (requestedRole && !['hiring', 'business'].includes(requestedRole)) {
        return sendError(res, 400, 'invalid_role', 'Select a valid employer role.');
      }
      const access = await ensureEmployerAccess(pool, req.auth.userId, requestedRole);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);
      const employerRole = requestedRole || access.employerRole;

      const jobId = fixedJobId || (typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '');
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      const params = [req.auth.userId];
      let where = 'WHERE j.employer_user_id = ?';
      where += ' AND j.employer_role = ?';
      params.push(employerRole);
      if (jobId) {
        where += ' AND a.job_id = ?';
        params.push(jobId);
      }
      if (status && status !== 'all') {
        where += ' AND a.status = ?';
        params.push(status);
      }
      if (q) {
        const like = `%${q}%`;
        where += ' AND (u.name LIKE ? OR u.email LIKE ? OR j.title LIKE ?)';
        params.push(like, like, like);
      }

      const [rows] = await pool.query(
        `SELECT a.*, j.title AS job_title, u.name AS applicant_name, u.email AS applicant_email
           FROM applications a
           JOIN jobs j ON j.id = a.job_id
           LEFT JOIN users u ON u.id = a.applicant_user_id
          ${where}
          ORDER BY a.applied_at DESC
          LIMIT 100`,
        params
      );

      const appIds = rows.map((r) => r.id);
      const attMap = new Map();
      if (appIds.length) {
        const [attRows] = await pool.query(
          `SELECT id, application_id, media_asset_id, file_name, mime_type, file_size
             FROM application_attachments
            WHERE application_id IN (${appIds.map(() => '?').join(',')})`,
          appIds
        );
        for (const att of attRows) {
          if (!attMap.has(att.application_id)) attMap.set(att.application_id, []);
          attMap.get(att.application_id).push({
            id: att.id,
            mediaAssetId: att.media_asset_id,
            fileName: att.file_name || 'Attachment',
            mimeType: att.mime_type || null,
            fileSize: att.file_size ? Number(att.file_size) : null,
          });
        }
      }

      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          jobTitle: r.job_title,
          applicantUserId: r.applicant_user_id,
          applicantName: r.applicant_name || 'Applicant',
          applicantEmail: r.applicant_email || null,
          applicantRole: r.applicant_role,
          coverNote: r.cover_note || null,
          answers: parseJson(r.answers, {}),
          status: r.status,
          internalNotes: r.internal_notes || null,
          interviewStage: r.interview_stage || null,
          attachments: attMap.get(r.id) || [],
          appliedAt: r.applied_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }

  router.get('/marketplace/employer/applications', authenticate, (req, res, next) =>
    listEmployerApplications(req, res, next)
  );
  router.get('/marketplace/jobs/:id/applications', authenticate, (req, res, next) =>
    listEmployerApplications(req, res, next, req.params.id)
  );

  router.patch('/marketplace/applications/:id', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.*, j.employer_user_id, j.employer_role
           FROM applications a
           JOIN jobs j ON j.id = a.job_id
          WHERE a.id = ? AND j.employer_user_id = ?
          LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) return sendError(res, 404, 'application_not_found', 'Application was not found.');
      const existing = rows[0];
      const access = await ensureEmployerAccess(pool, req.auth.userId, existing.employer_role);
      if (!access.ok) return sendError(res, access.status, access.code, access.message);
      const body = req.body || {};

      const nextStatus = body.status !== undefined ? String(body.status).trim() : existing.status;
      if (!VALID_APP_STATUSES.has(nextStatus)) {
        return sendError(res, 400, 'validation_error', 'Select a valid application status.');
      }
      if (
        nextStatus !== existing.status &&
        !EMPLOYER_APPLICATION_TRANSITIONS[existing.status]?.has(nextStatus)
      ) {
        return sendError(res, 409, 'invalid_application_transition', 'That application status transition is not allowed.');
      }

      const internalNotes = body.internalNotes !== undefined
        ? optionalText(body.internalNotes, 2000, 'Internal notes')
        : { value: existing.internal_notes };
      const interviewStage = body.interviewStage !== undefined
        ? optionalText(body.interviewStage, 80, 'Interview stage')
        : { value: existing.interview_stage };
      if (internalNotes.error || interviewStage.error) {
        return sendError(res, 400, 'validation_error', internalNotes.error || interviewStage.error);
      }

      await withTransaction(pool, async (connection) => {
        await connection.query(
          `UPDATE applications
              SET status = ?, internal_notes = ?, interview_stage = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [nextStatus, internalNotes.value, interviewStage.value, existing.id]
        );
        if (nextStatus !== existing.status) {
          await connection.query(
            `INSERT INTO application_status_history (
               id, application_id, from_status, to_status, changed_by_user_id, changed_by_role, note
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              existing.id,
              existing.status,
              nextStatus,
              req.auth.userId,
              access.employerRole,
              typeof body.note === 'string' ? body.note.trim().slice(0, 240) : null,
            ]
          );
        }
      });

      return res.json({
        application: {
          id: existing.id,
          status: nextStatus,
          internalNotes: internalNotes.value,
          interviewStage: interviewStage.value,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  // Protected private resume/attachment signed URL endpoint
  router.get('/marketplace/applications/:id/attachments/:attachmentId/url', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        `SELECT aa.object_key, aa.mime_type, a.applicant_user_id, j.employer_user_id
           FROM application_attachments aa
           JOIN applications a ON a.id = aa.application_id
           JOIN jobs j ON j.id = a.job_id
          WHERE aa.id = ? AND aa.application_id = ?
          LIMIT 1`,
        [req.params.attachmentId, req.params.id]
      );
      if (!rows.length) return sendError(res, 404, 'attachment_not_found', 'Attachment was not found.');
      const row = rows[0];
      if (row.applicant_user_id !== req.auth.userId && row.employer_user_id !== req.auth.userId) {
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

