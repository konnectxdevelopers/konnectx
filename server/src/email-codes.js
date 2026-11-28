import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;

export class EmailCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EmailCodeError';
    this.code = code;
  }
}

export function generateEmailCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function hashEmailCode(code, userId, purpose, secret) {
  return createHmac('sha256', secret)
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

export async function issueEmailCode({
  pool,
  userId,
  email,
  purpose,
  secret,
  sendEmail,
}) {
  const [recentCodes] = await pool.execute(
    `SELECT created_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${RESEND_COOLDOWN_SECONDS} SECOND) AS recent
       FROM auth_email_codes
      WHERE user_id = ? AND purpose = ?
      LIMIT 1`,
    [userId, purpose]
  );
  if (Number(recentCodes[0]?.recent) === 1) {
    throw new EmailCodeError('code_recently_sent', 'A code was sent recently.');
  }

  const code = generateEmailCode();
  const codeHash = hashEmailCode(code, userId, purpose, secret);
  await pool.execute(
    `INSERT INTO auth_email_codes (user_id, purpose, code_hash, expires_at, attempts)
     VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${CODE_TTL_MINUTES} MINUTE), 0)
     ON DUPLICATE KEY UPDATE
       code_hash = VALUES(code_hash),
       expires_at = VALUES(expires_at),
       attempts = 0,
       created_at = CURRENT_TIMESTAMP`,
    [userId, purpose, codeHash]
  );

  try {
    await sendEmail({ to: email, code, purpose });
  } catch (error) {
    await pool.execute(
      'DELETE FROM auth_email_codes WHERE user_id = ? AND purpose = ? AND code_hash = ?',
      [userId, purpose, codeHash]
    );
    throw error;
  }
}

export async function consumeEmailCode({
  pool,
  userId,
  purpose,
  code,
  secret,
  onVerified,
}) {
  const connection = await pool.getConnection();
  let committed = false;

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT code_hash, attempts,
              expires_at <= CURRENT_TIMESTAMP AS expired
         FROM auth_email_codes
        WHERE user_id = ? AND purpose = ?
        LIMIT 1
        FOR UPDATE`,
      [userId, purpose]
    );
    const record = rows[0];
    if (!record) {
      throw new EmailCodeError('otp_invalid', 'That code is not valid.');
    }

    if (Number(record.expired) === 1) {
      await connection.execute(
        'DELETE FROM auth_email_codes WHERE user_id = ? AND purpose = ?',
        [userId, purpose]
      );
      await connection.commit();
      committed = true;
      throw new EmailCodeError('otp_expired', 'That code has expired.');
    }

    if (Number(record.attempts) >= MAX_CODE_ATTEMPTS) {
      throw new EmailCodeError('otp_invalid', 'Too many attempts. Request a new code.');
    }

    const expectedHash = Buffer.from(hashEmailCode(code, userId, purpose, secret), 'hex');
    const actualHash = Buffer.from(record.code_hash, 'hex');
    if (
      expectedHash.length !== actualHash.length ||
      !timingSafeEqual(expectedHash, actualHash)
    ) {
      await connection.execute(
        `UPDATE auth_email_codes
            SET attempts = attempts + 1
          WHERE user_id = ? AND purpose = ?`,
        [userId, purpose]
      );
      await connection.commit();
      committed = true;
      throw new EmailCodeError('otp_invalid', 'That code is not valid.');
    }

    await onVerified(connection);
    await connection.execute(
      'DELETE FROM auth_email_codes WHERE user_id = ? AND purpose = ?',
      [userId, purpose]
    );
    await connection.commit();
    committed = true;
  } catch (error) {
    if (!committed) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}
