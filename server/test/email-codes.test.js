import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeEmailCode,
  EmailCodeError,
  generateEmailCode,
  issueEmailCode,
} from '../src/email-codes.js';

const SECRET = 'a-test-secret-that-is-long-enough-for-hmac';
const USER_ID = 'user-123';
const PURPOSE = 'verify_email';

function createFakePool() {
  const records = new Map();
  const keyFor = (userId, purpose) => `${userId}:${purpose}`;

  const execute = async (query, params) => {
    const key = keyFor(params[0], params[1]);
    if (query.includes('SELECT created_at >')) {
      const record = records.get(key);
      return [record ? [{ recent: record.recent ? 1 : 0 }] : []];
    }
    if (query.startsWith('INSERT INTO auth_email_codes')) {
      records.set(key, {
        code_hash: params[2],
        attempts: 0,
        expired: false,
        recent: true,
      });
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith('DELETE FROM auth_email_codes')) {
      const record = records.get(key);
      if (params.length < 3 || record?.code_hash === params[2]) {
        records.delete(key);
      }
      return [{ affectedRows: records.has(key) ? 0 : 1 }];
    }
    throw new Error(`Unexpected pool query: ${query}`);
  };

  return {
    records,
    execute,
    async getConnection() {
      return {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        async execute(query, params) {
          const key = keyFor(params[0], params[1]);
          const record = records.get(key);
          if (query.startsWith('SELECT code_hash')) {
            return [record ? [{
              code_hash: record.code_hash,
              attempts: record.attempts,
              expired: record.expired ? 1 : 0,
            }] : []];
          }
          if (query.startsWith('UPDATE auth_email_codes')) {
            if (record) {
              record.attempts += 1;
            }
            return [{ affectedRows: record ? 1 : 0 }];
          }
          if (query.startsWith('DELETE FROM auth_email_codes')) {
            records.delete(key);
            return [{ affectedRows: record ? 1 : 0 }];
          }
          throw new Error(`Unexpected connection query: ${query}`);
        },
      };
    },
  };
}

test('email codes are six digits and are stored as keyed hashes', async () => {
  assert.match(generateEmailCode(), /^\d{6}$/);

  const pool = createFakePool();
  let delivered;
  await issueEmailCode({
    pool,
    userId: USER_ID,
    email: 'person@example.com',
    purpose: PURPOSE,
    secret: SECRET,
    sendEmail: async (message) => { delivered = message; },
  });

  assert.match(delivered.code, /^\d{6}$/);
  assert.equal(delivered.to, 'person@example.com');
  assert.notEqual(pool.records.get(`${USER_ID}:${PURPOSE}`).code_hash, delivered.code);

  let verified = false;
  await consumeEmailCode({
    pool,
    userId: USER_ID,
    purpose: PURPOSE,
    code: delivered.code,
    secret: SECRET,
    onVerified: async () => { verified = true; },
  });
  assert.equal(verified, true);
  assert.equal(pool.records.has(`${USER_ID}:${PURPOSE}`), false);
});

test('wrong codes count toward the attempt limit and expired codes are removed', async () => {
  const pool = createFakePool();
  let deliveredCode;
  await issueEmailCode({
    pool,
    userId: USER_ID,
    email: 'person@example.com',
    purpose: PURPOSE,
    secret: SECRET,
    sendEmail: async ({ code }) => { deliveredCode = code; },
  });

  await assert.rejects(
    consumeEmailCode({
      pool,
      userId: USER_ID,
      purpose: PURPOSE,
      code: deliveredCode === '000000' ? '000001' : '000000',
      secret: SECRET,
      onVerified: async () => {},
    }),
    (error) => error instanceof EmailCodeError && error.code === 'otp_invalid'
  );
  assert.equal(pool.records.get(`${USER_ID}:${PURPOSE}`).attempts, 1);

  pool.records.get(`${USER_ID}:${PURPOSE}`).expired = true;
  await assert.rejects(
    consumeEmailCode({
      pool,
      userId: USER_ID,
      purpose: PURPOSE,
      code: deliveredCode,
      secret: SECRET,
      onVerified: async () => {},
    }),
    (error) => error instanceof EmailCodeError && error.code === 'otp_expired'
  );
  assert.equal(pool.records.has(`${USER_ID}:${PURPOSE}`), false);
});

test('email delivery failures remove the unusable code record', async () => {
  const pool = createFakePool();
  await assert.rejects(
    issueEmailCode({
      pool,
      userId: USER_ID,
      email: 'person@example.com',
      purpose: PURPOSE,
      secret: SECRET,
      sendEmail: async () => { throw new Error('SMTP failed'); },
    }),
    /SMTP failed/
  );
  assert.equal(pool.records.has(`${USER_ID}:${PURPOSE}`), false);
});

test('a verification code cannot be resent within the cooldown window', async () => {
  const pool = createFakePool();
  await issueEmailCode({
    pool,
    userId: USER_ID,
    email: 'person@example.com',
    purpose: PURPOSE,
    secret: SECRET,
    sendEmail: async () => {},
  });

  let sendCount = 0;
  await assert.rejects(
    issueEmailCode({
      pool,
      userId: USER_ID,
      email: 'person@example.com',
      purpose: PURPOSE,
      secret: SECRET,
      sendEmail: async () => { sendCount += 1; },
    }),
    (error) => error instanceof EmailCodeError && error.code === 'code_recently_sent'
  );
  assert.equal(sendCount, 0);
});
