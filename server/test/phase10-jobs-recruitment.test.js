import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const config = {
  jwtSecret: 'phase10-test-secret-key',
  jwtIssuer: 'konnectx-test',
  jwtAudience: 'konnectx-app',
  corsOrigins: [],
  uploadUrlTtlSeconds: 300,
  maxUploadBytes: 25000000,
  moderation: { requireReviewTypes: [] },
  email: { provider: 'console' },
  b2: {},
};

function makeToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: '1h',
  });
}

function createEmployerPool({ hiringEnabled = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalizedSql, params });

      if (normalizedSql === 'SELECT 1') return [[{ result: 1 }]];
      if (normalizedSql.startsWith('SELECT role, verification_status FROM user_roles')) {
        return [[
          { role: 'business', verification_status: 'verified' },
          { role: 'hiring', verification_status: 'verified' },
        ]];
      }
      if (normalizedSql.startsWith('SELECT hiring_enabled, profile FROM business_profiles')) {
        return [[{ hiring_enabled: hiringEnabled ? 1 : 0, profile: '{}' }]];
      }
      if (normalizedSql.startsWith('SELECT profile FROM hiring_profiles')) {
        return [[{ profile: '{}' }]];
      }
      if (normalizedSql.startsWith('SELECT id, application_id, media_asset_id, file_name, mime_type, file_size FROM application_attachments')) {
        return [[]];
      }
      if (normalizedSql.startsWith('SELECT a.*, j.title AS job_title')) {
        if (!normalizedSql.includes('AND j.employer_role = ?')) {
          throw new Error('Employer application queries must be scoped to the requested role.');
        }
        assert.equal(params[0], 'employer-1');
        assert.ok(['business', 'hiring'].includes(params[1]));
        return [[{
          id: 'application-1',
          job_id: `job-${params[1]}-1`,
          job_title: params[1] === 'business' ? 'Business Analyst' : 'Recruiter',
          applicant_user_id: 'applicant-1',
          applicant_name: 'Applicant',
          applicant_email: 'applicant@example.test',
          applicant_role: 'professional',
          cover_note: null,
          answers: '{}',
          status: 'submitted',
          internal_notes: null,
          interview_stage: null,
          applied_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }]];
      }
      throw new Error(`Unexpected SQL in Phase 10 test: ${normalizedSql}`);
    },
  };
}

async function startServer(pool) {
  const app = createApp({ pool, config });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('Phase 10 employer applications are role-scoped and require business hiring capability', async (t) => {
  const pool = createEmployerPool();
  const server = await startServer(pool);
  t.after(server.close);
  const token = makeToken('employer-1');

  const response = await fetch(`${server.url}/api/v1/marketplace/employer/applications?role=business`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].jobId, 'job-business-1');

  const defaultRoleResponse = await fetch(`${server.url}/api/v1/marketplace/employer/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(defaultRoleResponse.status, 200);
  const defaultRoleData = await defaultRoleResponse.json();
  assert.equal(defaultRoleData.items[0].jobId, 'job-hiring-1');

  const invalidRoleResponse = await fetch(`${server.url}/api/v1/marketplace/employer/applications?role=customer`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(invalidRoleResponse.status, 400);
});

test('Phase 10 business applicant access is denied when hiring capability is disabled', async (t) => {
  const pool = createEmployerPool({ hiringEnabled: false });
  const server = await startServer(pool);
  t.after(server.close);
  const token = makeToken('employer-1');

  const response = await fetch(`${server.url}/api/v1/marketplace/employer/applications?role=business`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(data.code, 'hiring_capability_disabled');
});
