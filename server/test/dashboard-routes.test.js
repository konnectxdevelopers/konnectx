import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes.js';

const USER_ID = '00000000-0000-4000-8000-000000000101';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000102';
const DASHBOARDS = {
  customer: { fullName: 'Customer profile' },
  professional: { headline: 'Professional profile' },
  business: { companyName: 'Business profile' },
  hiring: { hiringAs: 'individual' },
};

function createPool() {
  const records = new Map(
    Object.entries(DASHBOARDS).map(([role, profile]) => [
      `${USER_ID}:${role}`,
      {
        userId: USER_ID,
        userName: 'Test User',
        userEmail: 'test@example.com',
        selectedRole: role,
        profileCompletionStatus: 'complete',
        verificationStatus: 'pending',
        profile,
      },
    ])
  );

  return {
    async execute(query, params) {
      assert.match(query, /WHERE user_role\.user_id = \? AND user_role\.role = \?/i);
      const record = records.get(`${params[0]}:${params[1]}`);
      return [record ? [record] : []];
    },
  };
}

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use(createApiRouter({
    express,
    pool: createPool(),
    config: {
      jwtSecret: 'test-secret-that-is-long-enough-for-hmac-and-jwt',
      jwtIssuer: 'test-api',
      jwtAudience: 'test-app',
      uploadUrlTtlSeconds: 300,
      maxUploadBytes: 1000000,
      b2: {},
    },
    authenticate: (req, res, next) => {
      req.auth = { userId: req.get('x-test-user-id') || USER_ID };
      next();
    },
    sendEmail: async () => {},
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function get(url, path, userId = USER_ID) {
  const response = await fetch(`${url}${path}`, {
    headers: { 'x-test-user-id': userId },
  });
  return { status: response.status, body: await response.json() };
}

test('role dashboards return authenticated account profiles and server completion state', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  for (const [role, profile] of Object.entries(DASHBOARDS)) {
    const response = await get(server.url, `/api/v1/dashboard/${role}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.role, role);
    assert.equal(response.body.user.id, USER_ID);
    assert.deepEqual(response.body.profile, profile);
    assert.equal(response.body.profileCompletion.status, 'incomplete');
    assert.ok(response.body.profileCompletion.percentage > 0);
    assert.ok(response.body.profileCompletion.percentage < 100);
    assert.equal(response.body.verificationStatus, 'pending');
  }
});

test('a user cannot retrieve another account or an unassigned role dashboard', async (t) => {
  const server = await startTestServer();
  t.after(server.close);

  const response = await get(server.url, '/api/v1/dashboard/business', OTHER_USER_ID);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'role_access_denied');
});
