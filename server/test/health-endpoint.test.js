import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const config = {
  jwtSecret: 'test-secret-that-is-long-enough-for-hmac-and-jwt',
  jwtIssuer: 'test-api',
  jwtAudience: 'test-app',
  corsOrigins: [],
  email: {
    user: 'test@example.com',
    appPassword: 'test-app-password',
  },
  b2: {},
};

async function startTestServer(pool) {
  const server = createApp({ pool, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test('versioned and legacy health endpoints report API and database status', async (t) => {
  const server = await startTestServer({
    async query() {
      return [[{ result: 1 }]];
    },
  });
  t.after(server.close);

  for (const path of ['/api/v1/health', '/health']) {
    const response = await fetch(`${server.url}${path}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.api, 'ok');
    assert.equal(body.database, 'connected');
    assert.equal(typeof body.environment, 'string');
  }
});

test('health endpoint reports database failures without exposing error details', async (t) => {
  const server = await startTestServer({
    async query() {
      const error = new Error('connection string must not be exposed');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  });
  t.after(server.close);

  const response = await fetch(`${server.url}/api/v1/health`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(body.api, 'ok');
  assert.equal(body.database, 'disconnected');
  assert.equal(JSON.stringify(body).includes('connection string'), false);
});
