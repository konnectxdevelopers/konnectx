import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes.js';

const JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-and-jwt';
const PROFILE_USER_ID = '00000000-0000-4000-8000-000000000001';

function createFakePool() {
  const users = new Map();
  const codes = new Map();
  const roles = new Map();
  const profiles = new Map();
  const keyFor = (userId, purpose) => `${userId}:${purpose}`;
  const roleKey = (userId, role) => `${userId}:${role}`;

  async function execute(query, params = []) {
    const sql = query.replace(/\s+/g, ' ').trim().toLowerCase();

    if (sql.startsWith('insert into users')) {
      if ([...users.values()].some((user) => user.email === params[2])) {
        const error = new Error('Duplicate email.');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      users.set(params[0], {
        id: params[0],
        name: params[1],
        email: params[2],
        password_hash: params[3],
        phone: params[4],
        email_verified: 0,
        phone_verified: 0,
        selected_role: null,
        common_profile: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('from users where email = ?')) {
      const user = [...users.values()].find((item) => item.email === params[0]);
      if (!user) {
        return [[]];
      }
      if (sql.includes('password_hash')) {
        return [[user]];
      }
      if (sql.includes('email_verified')) {
        return [[{ id: user.id, email_verified: user.email_verified }]];
      }
      return [[{ id: user.id }]];
    }

    if (sql.includes('from users where id = ?')) {
      const user = users.get(params[0]);
      return [user ? [user] : []];
    }

    if (sql.includes('from user_roles where user_id = ? and role = ?')) {
      const role = roles.get(roleKey(params[0], params[1]));
      return [role ? [role] : []];
    }

    if (sql.includes('from user_roles where user_id = ?')) {
      return [[...roles.values()].filter((role) => role.user_id === params[0])];
    }

    if (sql.includes('select created_at >')) {
      const record = codes.get(keyFor(params[0], params[1]));
      return [record ? [{ recent: record.recent ? 1 : 0 }] : []];
    }

    if (sql.startsWith('insert into auth_email_codes')) {
      codes.set(keyFor(params[0], params[1]), {
        code_hash: params[2],
        attempts: 0,
        expired: false,
        recent: true,
      });
      return [{ affectedRows: 1 }];
    }

    if (sql.startsWith('delete from auth_email_codes')) {
      const key = keyFor(params[0], params[1]);
      const record = codes.get(key);
      if (params.length < 3 || record?.code_hash === params[2]) {
        codes.delete(key);
      }
      return [{ affectedRows: codes.has(key) ? 0 : 1 }];
    }

    if (sql.startsWith('delete from users')) {
      return [{ affectedRows: users.delete(params[0]) ? 1 : 0 }];
    }

    throw new Error(`Unexpected SQL query: ${sql}`);
  }

  return {
    users,
    codes,
    profiles,
    seedProfileUser(userId) {
      users.set(userId, {
        id: userId,
        name: 'Test User',
        email: 'person@example.com',
        password_hash: 'unused',
        phone: null,
        email_verified: 1,
        phone_verified: 0,
        selected_role: 'hiring',
        common_profile: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    },
    seedRole(userId, role) {
      roles.set(roleKey(userId, role), {
        user_id: userId,
        role,
        is_primary: 1,
        profile_completion_status: 'incomplete',
        profile_completion_percentage: 0,
        verification_status: 'not_started',
      });
    },
    execute,
    async getConnection() {
      return {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        async execute(query, params = []) {
          const sql = query.replace(/\s+/g, ' ').trim().toLowerCase();
          if (sql.startsWith('insert into hiring_profiles')) {
            profiles.set(params[0], JSON.parse(params[1]));
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith('update user_roles set profile_completion_status')) {
            const role = roles.get(roleKey(params[3], params[4]));
            if (role) {
              role.profile_completion_status = params[0];
              role.profile_completion_percentage = params[1];
              role.verification_status = params[2];
            }
            return [{ affectedRows: role ? 1 : 0 }];
          }
          const key = keyFor(params[0], params[1]);
          const record = codes.get(key);

          if (sql.startsWith('select code_hash')) {
            return [record ? [{
              code_hash: record.code_hash,
              attempts: record.attempts,
              expired: record.expired ? 1 : 0,
            }] : []];
          }
          if (sql.startsWith('update auth_email_codes')) {
            if (record) {
              record.attempts += 1;
            }
            return [{ affectedRows: record ? 1 : 0 }];
          }
          if (sql.startsWith('delete from auth_email_codes')) {
            codes.delete(key);
            return [{ affectedRows: record ? 1 : 0 }];
          }
          if (sql.startsWith('update users set email_verified')) {
            const user = users.get(params[0]);
            user.email_verified = 1;
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith('update users set password_hash')) {
            const user = users.get(params[1]);
            user.password_hash = params[0];
            user.email_verified = 1;
            return [{ affectedRows: 1 }];
          }
          throw new Error(`Unexpected connection query: ${sql}`);
        },
      };
    },
  };
}

async function startTestServer() {
  const pool = createFakePool();
  const sentEmails = [];
  const app = express();
  app.use(express.json());
  app.use(createApiRouter({
    express,
    pool,
    authenticate: (req, res, next) => {
      req.auth = { userId: PROFILE_USER_ID };
      next();
    },
    config: {
      jwtSecret: JWT_SECRET,
      jwtIssuer: 'test-api',
      jwtAudience: 'test-app',
      uploadUrlTtlSeconds: 300,
      maxUploadBytes: 1000000,
      b2: {},
    },
    sendEmail: async (message) => { sentEmails.push(message); },
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  return {
    pool,
    sentEmails,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function post(url, path, body) {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function put(url, path, body) {
  const response = await fetch(`${url}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('signup requires email verification; password reset uses a separate email code', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const signup = await post(`${server.url}`, '/auth/signup', {
    name: 'Test User',
    email: 'person@example.com',
    password: 'correct-horse-battery',
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.body.verificationRequired, true);
  assert.equal(signup.body.token, undefined);
  assert.equal(server.sentEmails[0].purpose, 'verify_email');

  const blockedLogin = await post(server.url, '/auth/login', {
    email: 'person@example.com',
    password: 'correct-horse-battery',
  });
  assert.equal(blockedLogin.status, 403);
  assert.equal(blockedLogin.body.code, 'email_unverified');

  const verificationCode = server.sentEmails[0].code;
  const verification = await post(server.url, '/auth/email-verification/verify', {
    email: 'person@example.com',
    code: verificationCode,
  });
  assert.equal(verification.status, 200);
  assert.equal(verification.body.user.emailVerified, true);
  assert.equal(typeof verification.body.token, 'string');

  const resetRequest = await post(server.url, '/auth/password-reset/request', {
    email: 'person@example.com',
  });
  assert.equal(resetRequest.status, 202);
  const resetEmail = server.sentEmails.at(-1);
  assert.equal(resetEmail.purpose, 'reset_password');

  const reset = await post(server.url, '/auth/password-reset/confirm', {
    email: 'person@example.com',
    code: resetEmail.code,
    password: 'new-correct-password',
  });
  assert.equal(reset.status, 200);

  const login = await post(server.url, '/auth/login', {
    email: 'person@example.com',
    password: 'new-correct-password',
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.emailVerified, true);
});

test('organization hiring profile drafts allow missing contact fields until submission', async (t) => {
  const server = await startTestServer();
  t.after(server.close);
  server.pool.seedProfileUser(PROFILE_USER_ID);
  server.pool.seedRole(PROFILE_USER_ID, 'hiring');

  const draft = await put(server.url, '/api/v1/profiles/hiring', {
    profile: { hiringAs: 'organization' },
    submit: false,
  });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.status, 'incomplete');
  assert.ok(draft.body.missing.includes('businessEmail'));
  assert.ok(draft.body.missing.includes('businessPhone'));
  assert.deepEqual(server.pool.profiles.get(PROFILE_USER_ID), {
    hiringAs: 'organization',
  });

  const invalidEmailDraft = await put(server.url, '/api/v1/profiles/hiring', {
    profile: { hiringAs: 'organization', businessEmail: 'not-an-email' },
    submit: false,
  });
  assert.equal(invalidEmailDraft.status, 400);
  assert.equal(invalidEmailDraft.body.code, 'invalid_profile_email');

  const invalidPhoneDraft = await put(server.url, '/api/v1/profiles/hiring', {
    profile: { hiringAs: 'organization', businessPhone: 'not-a-phone' },
    submit: false,
  });
  assert.equal(invalidPhoneDraft.status, 400);
  assert.equal(invalidPhoneDraft.body.code, 'invalid_profile_phone');

  const incompleteSubmission = await put(server.url, '/api/v1/profiles/hiring', {
    profile: { hiringAs: 'organization' },
    submit: true,
  });
  assert.equal(incompleteSubmission.status, 422);
  assert.equal(incompleteSubmission.body.code, 'profile_incomplete');
});
