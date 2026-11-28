import 'dotenv/config';

function required(name, minimumLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

export function getConfig() {
  const gmailUser = required('GMAIL_USER').trim();
  const gmailAppPassword = required('GMAIL_APP_PASSWORD').replace(/\s/g, '');
  if (!gmailUser || !gmailAppPassword) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be configured.');
  }

  return {
    port: Number(process.env.PORT || 4000),
    databaseUrl: required('DATABASE_URL'),
    databaseCaFile: process.env.DATABASE_CA_FILE || '',
    jwtSecret: required('JWT_SECRET', 32),
    jwtIssuer: process.env.JWT_ISSUER || 'konnectx-api',
    jwtAudience: process.env.JWT_AUDIENCE || 'konnectx-app',
    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    uploadUrlTtlSeconds: Math.min(
      Math.max(Number(process.env.UPLOAD_URL_TTL_SECONDS || 300), 60),
      900
    ),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 25000000),
    moderation: {
      requireReviewTypes: (process.env.MODERATION_REQUIRE_REVIEW_TYPES || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    },
    marketplace: {
      businessProjectProposalsEnabled: process.env.BUSINESS_PROJECT_PROPOSALS_ENABLED === 'true',
    },
    email: {
      user: gmailUser,
      appPassword: gmailAppPassword,
    },
    b2: {
      endpoint: process.env.B2_ENDPOINT || '',
      region: process.env.B2_REGION || '',
      bucket: process.env.B2_BUCKET || '',
      keyId: process.env.B2_KEY_ID || '',
      applicationKey: process.env.B2_APPLICATION_KEY || '',
    },
  };
}
