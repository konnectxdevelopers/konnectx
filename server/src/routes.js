import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { consumeEmailCode, EmailCodeError, issueEmailCode } from './email-codes.js';
import {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ROLE_TABLES, getProfileCompletion } from './profile-rules.js';
import { registerMarketplaceRoutes } from './marketplace-routes.js';
import { registerMarketplaceManagementRoutes } from './marketplace-management-routes.js';
import { registerShopProductRoutes } from './shop-product-routes.js';
import { registerJobsRecruitmentRoutes } from './jobs-recruitment-routes.js';
import { registerProjectsProposalsRoutes } from './projects-proposals-routes.js';
import { registerSearchRecommendationsRoutes } from './search-recommendations-routes.js';
import { registerUnifiedListingsRoutes } from './unified-listings-routes.js';
import { syncMarketplaceListing } from './marketplace-listings.js';
import { createB2Client, deletePrivateObject } from './storage.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9\s().-]{7,32}$/;
const ROLES = new Set(Object.keys(ROLE_TABLES));
const UPLOAD_PURPOSES = new Set([
  'profile-photo',
  'business-logo',
  'cover-image',
  'portfolio-image',
  'portfolio-video',
  'product-image',
  'project-attachment',
  'service-image',
  'service-video',
  'listing-image',
  'listing-video',
  'listing-document',
  'application-resume',
  'proposal-attachment',
  'certificate',
  'verification-document',
]);
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
};
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validUploadType(purpose, role, contentType) {
  if (purpose === 'listing-image') {
    return ['professional', 'business', 'hiring'].includes(role) && IMAGE_TYPES.has(contentType);
  }
  if (purpose === 'listing-video') {
    return ['professional', 'business', 'hiring'].includes(role) && contentType === 'video/mp4';
  }
  if (purpose === 'listing-document') {
    return ['professional', 'business', 'hiring'].includes(role) &&
      (IMAGE_TYPES.has(contentType) || contentType === 'application/pdf');
  }
  if (purpose === 'service-image') {
    return ['professional', 'business'].includes(role) && IMAGE_TYPES.has(contentType);
  }
  if (purpose === 'service-video' || purpose === 'portfolio-video') {
    return ['professional', 'business'].includes(role) && contentType === 'video/mp4';
  }
  if (purpose === 'product-image') {
    return role === 'business' && IMAGE_TYPES.has(contentType);
  }
  if (purpose === 'project-attachment') {
    return ['hiring', 'business'].includes(role) &&
      (IMAGE_TYPES.has(contentType) || contentType === 'application/pdf');
  }
  if (purpose === 'application-resume' || purpose === 'proposal-attachment') {
    return ['customer', 'professional', 'hiring', 'business'].includes(role) &&
      (IMAGE_TYPES.has(contentType) || contentType === 'application/pdf');
  }
  if (
    purpose === 'profile-photo' ||
    purpose === 'business-logo' ||
    purpose === 'cover-image' ||
    purpose === 'portfolio-image'
  ) {
    return IMAGE_TYPES.has(contentType);
  }
  return ['certificate', 'verification-document'].includes(purpose) &&
    contentType === 'application/pdf';
}

async function canUploadProjectAttachment(pool, userId, role) {
  if (role === 'hiring') return true;
  const [rows] = await pool.execute(
    'SELECT hiring_enabled FROM business_profiles WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return Boolean(rows[0]?.hiring_enabled);
}

function publicUser(row) {
  const capabilities = Array.from(new Set(
    row.roles.map((item) => item.role === 'hiring' ? 'customer' : item.role)
  ));
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: Number(row.email_verified) === 1,
    phone: row.phone || null,
    phoneVerified: Boolean(row.phone_verified),
    selectedRole: row.selected_role || null,
    capabilities,
    roles: row.roles.map((item) => ({
      role: item.role,
      isPrimary: Boolean(item.is_primary),
      profileCompletionStatus: item.profile_completion_status || 'incomplete',
      profileCompletionPercentage: Number(item.profile_completion_percentage || 0),
      verificationStatus: item.verification_status || 'not_started',
      profileCreatedAt: item.profile_created_at || null,
      profileUpdatedAt: item.profile_updated_at || null,
    })),
    profile: row.common_profile
      ? typeof row.common_profile === 'string'
        ? JSON.parse(row.common_profile)
        : row.common_profile
      : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createToken(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: '12h',
  });
}

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

async function transaction(pool, callback) {
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

function cleanProfile(input) {
  const profile = { ...input };
  delete profile.userId;
  delete profile.role;
  delete profile.createdAt;
  delete profile.updatedAt;
  delete profile.verificationStatus;
  delete profile.verified;
  delete profile.phoneVerified;
  return profile;
}

function hasProfileValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

async function findUser(pool, userId) {
  const [rows] = await pool.execute(
    `SELECT id, name, email, email_verified, phone, phone_verified,
            selected_role, common_profile, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!rows[0]) {
    return null;
  }
  const [roles] = await pool.execute(
    `SELECT role, is_primary, profile_completion_status, profile_completion_percentage,
            verification_status, profile_created_at, profile_updated_at
       FROM user_roles WHERE user_id = ? ORDER BY is_primary DESC, role`,
    [userId]
  );
  return { ...rows[0], roles };
}

function ensureRole(role) {
  return typeof role === 'string' && ROLES.has(role);
}

export function createApiRouter({ express, pool, config, authenticate, sendEmail }) {
  const router = express.Router();

  const signup = async (req, res, next) => {
    try {
      const { name, email, password, phone = null } = req.body || {};
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (cleanName.length < 2 || cleanName.length > 160) {
        return sendError(res, 400, 'invalid_name', 'Enter a valid full name.');
      }
      if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 254) {
        return sendError(res, 400, 'invalid_email', 'Enter a valid email address.');
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return sendError(res, 400, 'invalid_password', 'Password must be 8–128 characters.');
      }
      if (
        phone !== null &&
        (typeof phone !== 'string' ||
          !PHONE_PATTERN.test(phone.trim()) ||
          phone.replace(/\D/g, '').length < 7 ||
          phone.replace(/\D/g, '').length > 15)
      ) {
        return sendError(res, 400, 'invalid_phone', 'Enter a valid phone number.');
      }

      const id = randomUUID();
      const passwordHash = await bcrypt.hash(password, 12);
      await pool.execute(
        `INSERT INTO users (id, name, email, password_hash, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [id, cleanName, cleanEmail, passwordHash, phone]
      );
      try {
        await issueEmailCode({
          pool,
          userId: id,
          email: cleanEmail,
          purpose: 'verify_email',
          secret: config.jwtSecret,
          sendEmail,
        });
      } catch (error) {
        await pool.execute(
          'DELETE FROM users WHERE id = ? AND email_verified = FALSE',
          [id]
        );
        throw error;
      }
      return res.status(201).json({ verificationRequired: true, email: cleanEmail });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendError(res, 409, 'email_taken', 'An account with this email already exists.');
      }
      return next(error);
    }
  };

  const login = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      const password = req.body?.password;
      if (!EMAIL_PATTERN.test(email) || typeof password !== 'string') {
        return sendError(res, 400, 'invalid_credentials', 'Enter your email and password.');
      }

      const [rows] = await pool.execute(
        `SELECT id, name, email, password_hash, email_verified, phone,
                phone_verified, selected_role, common_profile, created_at, updated_at
           FROM users WHERE email = ? LIMIT 1`,
        [email]
      );
      const user = rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return sendError(res, 401, 'invalid_credentials', 'The email or password is incorrect.');
      }
      if (Number(user.email_verified) !== 1) {
        try {
          await issueEmailCode({
            pool,
            userId: user.id,
            email: user.email,
            purpose: 'verify_email',
            secret: config.jwtSecret,
            sendEmail,
          });
        } catch (error) {
          if (!(error instanceof EmailCodeError) || error.code !== 'code_recently_sent') {
            throw error;
          }
        }
        return sendError(
          res,
          403,
          'email_unverified',
          'Verify your email address before signing in. Check your inbox and spam folder for the code.'
        );
      }
      const currentUser = await findUser(pool, user.id);
      return res.json({
        token: createToken(user.id, config),
        user: publicUser(currentUser),
      });
    } catch (error) {
      return next(error);
    }
  };

  router.post('/api/v1/auth/signup', signup);
  router.post('/auth/signup', signup);
  router.post('/api/v1/auth/login', login);
  router.post('/auth/login', login);

  const requestEmailVerification = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return sendError(res, 400, 'invalid_email', 'Enter a valid email address.');
      }

      const [users] = await pool.execute(
        'SELECT id, email_verified FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = users[0];
      if (user && Number(user.email_verified) !== 1) {
        await issueEmailCode({
          pool,
          userId: user.id,
          email,
          purpose: 'verify_email',
          secret: config.jwtSecret,
          sendEmail,
        });
      }
      return res.status(202).json({
        message: 'If this account needs verification, a code has been sent.',
      });
    } catch (error) {
      if (error instanceof EmailCodeError && error.code === 'code_recently_sent') {
        return sendError(res, 429, error.code, error.message);
      }
      return next(error);
    }
  };

  const verifyEmail = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!EMAIL_PATTERN.test(email) || email.length > 254 || !/^\d{6}$/.test(code)) {
        return sendError(res, 400, 'otp_invalid', 'Enter the email code sent to you.');
      }

      const [users] = await pool.execute(
        'SELECT id, email_verified FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = users[0];
      if (!user || Number(user.email_verified) === 1) {
        return sendError(res, 400, 'otp_invalid', 'That code is not valid.');
      }

      await consumeEmailCode({
        pool,
        userId: user.id,
        purpose: 'verify_email',
        code,
        secret: config.jwtSecret,
        onVerified: (connection) => connection.execute(
          'UPDATE users SET email_verified = TRUE WHERE id = ?',
          [user.id]
        ),
      });

      const verifiedUser = await findUser(pool, user.id);
      return res.json({
        token: createToken(user.id, config),
        user: publicUser(verifiedUser),
      });
    } catch (error) {
      if (error instanceof EmailCodeError) {
        const status = error.code === 'otp_expired' ? 410 : 400;
        return sendError(res, status, error.code, error.message);
      }
      return next(error);
    }
  };

  const requestPasswordReset = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return sendError(res, 400, 'invalid_email', 'Enter a valid email address.');
      }

      const [users] = await pool.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      if (users[0]) {
        try {
          await issueEmailCode({
            pool,
            userId: users[0].id,
            email,
            purpose: 'reset_password',
            secret: config.jwtSecret,
            sendEmail,
          });
        } catch (error) {
          if (!(error instanceof EmailCodeError) || error.code !== 'code_recently_sent') {
            throw error;
          }
        }
      }
      return res.status(202).json({
        message: 'If an account exists for this address, a reset code has been sent.',
      });
    } catch (error) {
      return next(error);
    }
  };

  const confirmPasswordReset = async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const password = req.body?.password;
      if (!EMAIL_PATTERN.test(email) || email.length > 254 || !/^\d{6}$/.test(code)) {
        return sendError(res, 400, 'otp_invalid', 'Enter the email code sent to you.');
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return sendError(res, 400, 'invalid_password', 'Password must be 8–128 characters.');
      }

      const [users] = await pool.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      const user = users[0];
      if (!user) {
        return sendError(res, 400, 'otp_invalid', 'That code is not valid.');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await consumeEmailCode({
        pool,
        userId: user.id,
        purpose: 'reset_password',
        code,
        secret: config.jwtSecret,
        onVerified: (connection) => connection.execute(
          'UPDATE users SET password_hash = ?, email_verified = TRUE WHERE id = ?',
          [passwordHash, user.id]
        ),
      });
      return res.json({ message: 'Your password has been reset. Sign in with your new password.' });
    } catch (error) {
      if (error instanceof EmailCodeError) {
        const status = error.code === 'otp_expired' ? 410 : 400;
        return sendError(res, status, error.code, error.message);
      }
      return next(error);
    }
  };

  router.post(['/api/v1/auth/email-verification/request', '/auth/email-verification/request'], requestEmailVerification);
  router.post(['/api/v1/auth/email-verification/verify', '/auth/email-verification/verify'], verifyEmail);
  router.post(['/api/v1/auth/password-reset/request', '/auth/password-reset/request'], requestPasswordReset);
  router.post(['/api/v1/auth/password-reset/confirm', '/auth/password-reset/confirm'], confirmPasswordReset);

  for (const role of Object.keys(ROLE_TABLES)) {
    const profileTable = ROLE_TABLES[role];
    router.get(`/api/v1/dashboard/${role}`, authenticate, async (req, res, next) => {
      try {
        const [rows] = await pool.execute(
          `SELECT u.id AS userId, u.name AS userName, u.email AS userEmail,
                  u.selected_role AS selectedRole,
                  user_role.profile_completion_status AS profileCompletionStatus,
                  user_role.verification_status AS verificationStatus,
                  role_profile.profile AS profile
             FROM user_roles AS user_role
             INNER JOIN users AS u ON u.id = user_role.user_id
             LEFT JOIN ${profileTable} AS role_profile
               ON role_profile.user_id = user_role.user_id
            WHERE user_role.user_id = ? AND user_role.role = ?
            LIMIT 1`,
          [req.auth.userId, role]
        );
        if (!rows.length) {
          return sendError(
            res,
            403,
            'role_access_denied',
            'Your account does not have access to this role dashboard.'
          );
        }

        const row = rows[0];
        const profile = row.profile
          ? typeof row.profile === 'string'
            ? JSON.parse(row.profile)
            : row.profile
          : {};
        const completion = getProfileCompletion(role, profile);
        return res.json({
          role,
          user: {
            id: row.userId,
            name: row.userName,
            email: row.userEmail,
            selectedRole: row.selectedRole,
          },
          profile,
          profileCompletion: {
            status: completion.complete ? 'complete' : 'incomplete',
            percentage: completion.percentage,
            missing: completion.missing,
          },
          verificationStatus: row.verificationStatus,
        });
      } catch (error) {
        return next(error);
      }
    });
  }

  router.get('/api/v1/users/me', authenticate, async (req, res, next) => {
    try {
      const user = await findUser(pool, req.auth.userId);
      if (!user) {
        return sendError(res, 404, 'user_not_found', 'Account was not found.');
      }
      const [roles] = await pool.execute(
        `SELECT role, is_primary AS isPrimary, profile_completion_status AS profileCompletionStatus,
                profile_completion_percentage AS profileCompletionPercentage,
                verification_status AS verificationStatus, profile_created_at AS profileCreatedAt,
                profile_updated_at AS profileUpdatedAt
           FROM user_roles WHERE user_id = ? ORDER BY is_primary DESC, role`,
        [req.auth.userId]
      );
      return res.json({ user: publicUser(user), roles });
    } catch (error) {
      return next(error);
    }
  });

  router.patch(
    ['/api/v1/users/me', '/auth/profile'],
    authenticate,
    async (req, res, next) => {
      try {
        const { name, phone, profile } = req.body || {};
        if (['capabilities', 'primaryType', 'activeMode'].some((key) => key in req.body)) {
          return sendError(
            res,
            400,
            'use_role_selection_endpoint',
            'Use the authenticated role-selection endpoint to change account types.'
          );
        }
        const updates = [];
        const values = [];
        if (name !== undefined) {
          if (typeof name !== 'string' || name.trim().length < 2 || name.length > 160) {
            return sendError(res, 400, 'invalid_name', 'Enter a valid full name.');
          }
          updates.push('name = ?');
          values.push(name.trim());
        }
        if (phone !== undefined) {
          if (phone !== null && (typeof phone !== 'string' || phone.length > 32)) {
            return sendError(res, 400, 'invalid_phone', 'Enter a valid phone number.');
          }
          updates.push('phone = ?', 'phone_verified = FALSE');
          values.push(phone);
        }
        if (profile !== undefined && (!profile || typeof profile !== 'object' || Array.isArray(profile))) {
          return sendError(res, 400, 'invalid_profile', 'Profile updates must be an object.');
        }
        if (profile !== undefined) {
          const currentUser = await findUser(pool, req.auth.userId);
          if (!currentUser) {
            return sendError(res, 404, 'user_not_found', 'Account was not found.');
          }
          const currentProfile = currentUser.common_profile
            ? typeof currentUser.common_profile === 'string'
              ? JSON.parse(currentUser.common_profile)
              : currentUser.common_profile
            : {};
          updates.push('common_profile = ?');
          values.push(JSON.stringify({ ...currentProfile, ...profile }));
        }
        if (updates.length) {
          values.push(req.auth.userId);
          await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        }
        const user = await findUser(pool, req.auth.userId);
        return res.json({ user: publicUser(user) });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post('/api/v1/users/select-role', authenticate, async (req, res, next) => {
    try {
      const role = req.body?.role;
      if (!ensureRole(role)) {
        return sendError(res, 400, 'invalid_role', 'Choose one of the supported account types.');
      }
      await transaction(pool, async (connection) => {
        await connection.execute(
          `UPDATE user_roles SET is_primary = FALSE WHERE user_id = ?`,
          [req.auth.userId]
        );
        await connection.execute(
          `INSERT INTO user_roles (user_id, role, is_primary)
           VALUES (?, ?, TRUE)
           ON DUPLICATE KEY UPDATE is_primary = TRUE`,
          [req.auth.userId, role]
        );
        await connection.execute(
          `UPDATE users SET selected_role = ? WHERE id = ?`,
          [role, req.auth.userId]
        );
      });
      return res.status(200).json({ selectedRole: role });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/v1/users/registration-status', authenticate, async (req, res, next) => {
    try {
      const user = await findUser(pool, req.auth.userId);
      if (!user) {
        return sendError(res, 404, 'user_not_found', 'Account was not found.');
      }
      const [roles] = await pool.execute(
        `SELECT role, profile_completion_status AS status,
                profile_completion_percentage AS percentage,
                verification_status AS verificationStatus
           FROM user_roles WHERE user_id = ? ORDER BY is_primary DESC, role`,
        [req.auth.userId]
      );
      const selected = roles.find((item) => item.role === user.selected_role);
      const nextAction = !selected
        ? 'select_role'
        : selected.status === 'complete'
          ? 'dashboard'
          : 'complete_profile';
      return res.json({
        selectedRole: user.selected_role,
        roles,
        nextAction,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/v1/profiles/:role', authenticate, async (req, res, next) => {
    try {
      const { role } = req.params;
      if (!ensureRole(role)) {
        return sendError(res, 404, 'profile_not_found', 'Role profile was not found.');
      }
      const [assignments] = await pool.execute(
        `SELECT profile_completion_status AS status,
                profile_completion_percentage AS percentage,
                verification_status AS verificationStatus,
                profile_created_at AS profileCreatedAt,
                profile_updated_at AS profileUpdatedAt
           FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1`,
        [req.auth.userId, role]
      );
      if (!assignments.length) {
        return sendError(res, 404, 'role_not_selected', 'Select this account type first.');
      }
      const table = ROLE_TABLES[role];
      const [profiles] = await pool.execute(
        `SELECT profile, created_at AS createdAt, updated_at AS updatedAt
           FROM ${table} WHERE user_id = ? LIMIT 1`,
        [req.auth.userId]
      );
      const profile = profiles[0]
        ? typeof profiles[0].profile === 'string'
          ? JSON.parse(profiles[0].profile)
          : profiles[0].profile
        : {};
      return res.json({ role, profile, ...assignments[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/api/v1/profiles/:role', authenticate, async (req, res, next) => {
    try {
      const { role } = req.params;
      if (!ensureRole(role)) {
        return sendError(res, 404, 'profile_not_found', 'Role profile was not found.');
      }
      const incoming = req.body?.profile;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return sendError(res, 400, 'invalid_profile', 'Profile must be an object.');
      }
      const [assignments] = await pool.execute(
        `SELECT role, profile_completion_status, verification_status
           FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1`,
        [req.auth.userId, role]
      );
      if (!assignments.length) {
        return sendError(res, 409, 'role_not_selected', 'Select this account type first.');
      }
      const user = await findUser(pool, req.auth.userId);
      if (!user) {
        return sendError(res, 404, 'user_not_found', 'Account was not found.');
      }

      const profile = cleanProfile(incoming);
      if (
        role === 'hiring' &&
        !['individual', 'organization'].includes(profile.hiringAs)
      ) {
        return sendError(
          res,
          400,
          'invalid_hiring_type',
          'Choose whether you are hiring as an individual or an organization.'
        );
      }
      let emailFields = ['email'];
      if (role === 'business') {
        emailFields = ['contactEmail'];
      } else if (role === 'hiring' && profile.hiringAs === 'organization') {
        emailFields = ['businessEmail'];
      }
      const invalidEmail = emailFields.find((field) => {
        const value = profile[field];
        return hasProfileValue(value) &&
          (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim()));
      });
      if (invalidEmail) {
        return sendError(
          res,
          400,
          'invalid_profile_email',
          'Enter a valid email address for this profile.',
          { field: invalidEmail }
        );
      }
      const phoneFields =
        role === 'business' ||
        (role === 'hiring' && profile.hiringAs === 'organization')
          ? ['businessPhone']
          : [];
      const invalidPhone = phoneFields.find((field) => {
        const value = profile[field];
        return hasProfileValue(value) &&
          (typeof value !== 'string' ||
            !PHONE_PATTERN.test(value.trim()) ||
            value.replace(/\D/g, '').length < 7 ||
            value.replace(/\D/g, '').length > 15);
      });
      if (invalidPhone) {
        return sendError(
          res,
          400,
          'invalid_profile_phone',
          'Enter a valid phone number for this profile.',
          { field: invalidPhone }
        );
      }
      const completion = getProfileCompletion(role, profile);
      const submit = req.body.submit === true;
      const status = completion.complete &&
        (req.body.submit === true || assignments[0].profile_completion_status === 'complete')
        ? 'complete'
        : 'incomplete';
      const requiresVerification =
        ['professional', 'business'].includes(role) ||
        (role === 'hiring' && profile.hiringAs === 'organization');
      let verificationStatus = 'not_started';
      if (status === 'complete') {
        if (assignments[0].verification_status === 'verified') {
          verificationStatus = 'verified';
        } else {
          verificationStatus = requiresVerification ? 'pending' : 'not_required';
        }
      }
      const table = ROLE_TABLES[role];

      await transaction(pool, async (connection) => {
        if (role === 'business') {
          const hiringEnabled = profile.hiringEnabled === true || profile.hiringEnabled === 'true';
          await connection.execute(
            `INSERT INTO ${table} (user_id, hiring_enabled, profile)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE hiring_enabled = VALUES(hiring_enabled), profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
            [req.auth.userId, hiringEnabled, JSON.stringify(profile)]
          );
        } else {
          await connection.execute(
            `INSERT INTO ${table} (user_id, profile)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
            [req.auth.userId, JSON.stringify(profile)]
          );
        }
        await connection.execute(
          `UPDATE user_roles
              SET profile_completion_status = ?,
                  profile_completion_percentage = ?,
                  verification_status = ?,
                  profile_created_at = COALESCE(profile_created_at, CURRENT_TIMESTAMP),
                  profile_updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND role = ?`,
          [
            status,
            completion.percentage,
            verificationStatus,
            req.auth.userId,
            role,
          ]
        );
        if (role === 'business' || role === 'professional') {
          const listingType = role === 'business' ? 'business_profile' : 'professional_profile';
          const [existingProfile] = await connection.execute(
            `SELECT listing_id FROM ${table} WHERE user_id = ? LIMIT 1`,
            [req.auth.userId]
          );
          let listingId = existingProfile[0]?.listing_id || null;
          if (!listingId) {
            const [collision] = await connection.execute(
              'SELECT id, listing_type FROM marketplace_listings WHERE id = ? LIMIT 1',
              [req.auth.userId]
            );
            listingId = !collision.length || [role, listingType].includes(collision[0].listing_type)
              ? req.auth.userId
              : randomUUID();
            await connection.execute(
              `UPDATE ${table} SET listing_id = ? WHERE user_id = ?`,
              [listingId, req.auth.userId]
            );
          }
          const locationObj = profile.city || profile.state || profile.country
            ? {
              city: profile.city || null,
              state: profile.state || null,
              country: profile.country || null,
              area: profile.area || null,
            }
            : null;
          await syncMarketplaceListing(connection, {
            id: listingId,
            entityId: req.auth.userId,
            type: listingType,
            ownerId: req.auth.userId,
            ownerRole: role,
            title: role === 'business'
              ? profile.companyName || profile.businessName || 'Business'
              : profile.fullName || 'Professional',
            shortSummary: role === 'business'
              ? profile.shortDescription || null
              : profile.headline || null,
            description: role === 'business'
              ? profile.detailedDescription || profile.shortDescription || profile.companyDescription || null
              : profile.bio || profile.headline || null,
            location: locationObj,
            status: status === 'complete' ? 'published' : 'draft',
          }, { linkCategory: false });
        }
      });

      const result = {
        role,
        profile,
        status,
        percentage: completion.percentage,
        verificationStatus,
        missing: completion.missing,
      };
      if (submit && !completion.complete) {
        return res.status(422).json({
          code: 'profile_incomplete',
          message: 'Complete the required fields before submitting.',
          ...result,
        });
      }
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/v1/uploads/presign', authenticate, async (req, res, next) => {
    try {
      const role = req.body?.role;
      const purpose = req.body?.purpose;
      const contentType = req.body?.contentType;
      const byteSize = Number(req.body?.byteSize);
      if (!ensureRole(role) || !UPLOAD_PURPOSES.has(purpose)) {
        return sendError(res, 400, 'invalid_upload', 'Role and upload purpose are required.');
      }
      if (!Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, contentType) ||
          !validUploadType(purpose, role, contentType)) {
        return sendError(res, 415, 'unsupported_media_type', 'This file type is not supported.');
      }
      if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > config.maxUploadBytes) {
        return sendError(res, 413, 'file_too_large', 'File size is outside the permitted limit.');
      }
      const [assignments] = await pool.execute(
        `SELECT role FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1`,
        [req.auth.userId, role]
      );
      if (!assignments.length) {
        return sendError(res, 409, 'role_not_selected', 'Select this account type first.');
      }
      if (purpose === 'project-attachment' &&
          !(await canUploadProjectAttachment(pool, req.auth.userId, role))) {
        return sendError(res, 403, 'hiring_capability_disabled', 'Business project attachments require hiring capability to be enabled.');
      }
      const client = createB2Client(config);
      if (!client) {
        return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      }

      const objectKey = `${req.auth.userId}/${role}/${randomUUID()}${MIME_EXTENSIONS[contentType]}`;
      const command = new PutObjectCommand({
        Bucket: config.b2.bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: byteSize,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: config.uploadUrlTtlSeconds,
      });
      return res.status(201).json({
        uploadUrl,
        objectKey,
        contentType,
        byteSize,
        expiresIn: config.uploadUrlTtlSeconds,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/v1/uploads/complete', authenticate, async (req, res, next) => {
    try {
      const { objectKey, role, purpose, contentType, byteSize } = req.body || {};
      const prefix = `${req.auth.userId}/${role}/`;
      if (
        typeof objectKey !== 'string' ||
        !ensureRole(role) ||
        !objectKey.startsWith(prefix) ||
        !UPLOAD_PURPOSES.has(purpose) ||
        !Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, contentType) ||
        !validUploadType(purpose, role, contentType)
      ) {
        return sendError(res, 400, 'invalid_upload', 'Upload metadata is invalid.');
      }
      const expectedByteSize = Number(byteSize);
      if (
        !Number.isSafeInteger(expectedByteSize) ||
        expectedByteSize < 1 ||
        expectedByteSize > config.maxUploadBytes
      ) {
        return sendError(res, 413, 'file_too_large', 'File size is outside the permitted limit.');
      }
      const client = createB2Client(config);
      if (!client) {
        return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      }
      const [assignments] = await pool.execute(
        `SELECT role FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1`,
        [req.auth.userId, role]
      );
      if (!assignments.length) {
        return sendError(res, 409, 'role_not_selected', 'Select this account type first.');
      }
      if (purpose === 'project-attachment' &&
          !(await canUploadProjectAttachment(pool, req.auth.userId, role))) {
        return sendError(res, 403, 'hiring_capability_disabled', 'Business project attachments require hiring capability to be enabled.');
      }
      const object = await client.send(
        new HeadObjectCommand({ Bucket: config.b2.bucket, Key: objectKey })
      );
      if (
        object.ContentType !== contentType ||
        Number(object.ContentLength) !== expectedByteSize
      ) {
        return sendError(res, 409, 'upload_mismatch', 'Uploaded file metadata did not match.');
      }
      const id = randomUUID();
      await pool.execute(
        `INSERT INTO media_assets
           (id, user_id, role, object_key, content_type, byte_size, purpose, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
        [id, req.auth.userId, role, objectKey, contentType, expectedByteSize, purpose]
      );
      return res.status(201).json({ id, objectKey, role, purpose, contentType, byteSize, status: 'pending' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendError(res, 409, 'upload_already_registered', 'Upload metadata already exists.');
      }
      return next(error);
    }
  });

  router.delete('/api/v1/uploads/pending/:id', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT id, object_key, status FROM media_assets
          WHERE id = ? AND user_id = ? LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) {
        return sendError(res, 404, 'media_not_found', 'Uploaded asset was not found.');
      }
      if (rows[0].status !== 'pending') {
        return sendError(res, 409, 'media_in_use', 'Attached media cannot be removed as a pending upload.');
      }
      const [refs] = await pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM listing_media WHERE media_asset_id = ?) +
           (SELECT COUNT(*) FROM service_media WHERE media_asset_id = ?) +
           (SELECT COUNT(*) FROM professional_portfolio_items WHERE media_asset_id = ?) +
           (SELECT COUNT(*) FROM business_profiles bp
             WHERE bp.user_id = ? AND (
               JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.logoMediaId')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.logoMediaId.id')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.coverMediaId')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.coverMediaId.id')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyLogo')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyLogo.id')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.coverImage')) = ? OR
               JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.coverImage.id')) = ?
             )) AS total`,
        [
          rows[0].id,
          rows[0].id,
          rows[0].id,
          req.auth.userId,
          rows[0].id,
          rows[0].id,
          rows[0].id,
          rows[0].id,
          rows[0].id,
          rows[0].id,
          rows[0].id,
          rows[0].id,
        ]
      );
      if (Number(refs[0]?.total || 0) > 0) {
        return sendError(res, 409, 'media_in_use', 'This media asset is already attached to a listing.');
      }
      if (!createB2Client(config)) {
        return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      }
      await deletePrivateObject(config, rows[0].object_key);
      await pool.execute('DELETE FROM media_assets WHERE id = ? AND user_id = ?', [
        rows[0].id,
        req.auth.userId,
      ]);
      return res.json({ deleted: true, id: rows[0].id });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/api/v1/uploads/cleanup-orphans', authenticate, async (req, res, next) => {
    try {
      const [orphans] = await pool.execute(
        `SELECT ma.id, ma.object_key
           FROM media_assets ma
          WHERE ma.user_id = ?
            AND ma.status = 'pending'
            AND (ma.expires_at IS NULL OR ma.expires_at < NOW() OR ? = TRUE)
            AND NOT EXISTS (SELECT 1 FROM listing_media lm WHERE lm.media_asset_id = ma.id)
            AND NOT EXISTS (SELECT 1 FROM service_media sm WHERE sm.media_asset_id = ma.id)
            AND NOT EXISTS (SELECT 1 FROM professional_portfolio_items pi WHERE pi.media_asset_id = ma.id)
            AND NOT EXISTS (
              SELECT 1 FROM business_profiles bp
               WHERE bp.user_id = ma.user_id AND (
                 JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.logoMediaId')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.logoMediaId.id')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.coverMediaId')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.shop_settings, '$.coverMediaId.id')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyLogo')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.companyLogo.id')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.coverImage')) = ma.id OR
                 JSON_UNQUOTE(JSON_EXTRACT(bp.profile, '$.coverImage.id')) = ma.id
               )
            )
          LIMIT 50`,
        [req.auth.userId, Boolean(req.body?.includeActivePending)]
      );
      if (orphans.length && !createB2Client(config)) {
        return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      }
      let cleaned = 0;
      for (const orphan of orphans) {
        await deletePrivateObject(config, orphan.object_key);
        await pool.execute('DELETE FROM media_assets WHERE id = ? AND user_id = ?', [
          orphan.id,
          req.auth.userId,
        ]);
        cleaned += 1;
      }
      return res.json({ cleaned });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/v1/uploads/:id/url', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT object_key AS objectKey FROM media_assets
          WHERE id = ? AND user_id = ? LIMIT 1`,
        [req.params.id, req.auth.userId]
      );
      if (!rows.length) {
        return sendError(res, 404, 'media_not_found', 'File was not found.');
      }
      const client = createB2Client(config);
      if (!client) {
        return sendError(res, 503, 'storage_unavailable', 'Private file storage is not configured.');
      }
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.b2.bucket, Key: rows[0].objectKey }),
        { expiresIn: config.uploadUrlTtlSeconds }
      );
      return res.json({ url, expiresIn: config.uploadUrlTtlSeconds });
    } catch (error) {
      return next(error);
    }
  });

  registerSearchRecommendationsRoutes(router, { pool, config, authenticate });
  registerProjectsProposalsRoutes(router, { pool, config, authenticate });
  registerJobsRecruitmentRoutes(router, { pool, config, authenticate });
  registerShopProductRoutes(router, { pool, config, authenticate });
  registerMarketplaceRoutes(router, { pool, config, authenticate });
  registerMarketplaceManagementRoutes(router, { pool, authenticate, config });
  registerUnifiedListingsRoutes(router, { pool, config, authenticate });

  return router;
}
