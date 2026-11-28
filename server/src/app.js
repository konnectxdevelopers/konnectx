import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createAuthMiddleware } from './middleware/auth.js';
import { createEmailSender } from './mailer.js';
import { createApiRouter } from './routes.js';

const LOCAL_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function createApp({ pool, config }) {
  const app = express();
  const authenticate = createAuthMiddleware(config);
  const sendEmail = createEmailSender(config.email);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      // Native apps send no Origin header; Expo web on the LAN sends a private
      // address that changes with DHCP, so allow local origins in development.
      if (
        !origin ||
        config.corsOrigins.includes(origin) ||
        LOCAL_ORIGIN_PATTERN.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS.'));
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(['/api/v1/auth', '/auth'], authLimiter);

  const healthCheck = async (req, res) => {
    try {
      await pool.query('SELECT 1');
      return res.json({
        status: 'ok',
        api: 'ok',
        database: 'connected',
        environment: process.env.NODE_ENV || 'development',
      });
    } catch (error) {
      console.error('API health check failed.', {
        code: error.code || 'database_error',
      });
      return res.status(503).json({
        status: 'degraded',
        api: 'ok',
        database: 'disconnected',
        environment: process.env.NODE_ENV || 'development',
      });
    }
  };
  app.get(['/health', '/api/v1/health'], healthCheck);

  const apiRouter = createApiRouter({ express, pool, config, authenticate, sendEmail });
  app.use('/api/v1', apiRouter);
  app.use(apiRouter);

  app.use((req, res) => {
    res.status(404).json({ code: 'not_found', message: 'Route was not found.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error.message === 'Origin is not allowed by CORS.') {
      res.status(403).json({ code: 'origin_not_allowed', message: error.message });
      return;
    }
    const errorDetails = {
      method: req.method,
      path: req.path,
      code: error.code || 'internal_error',
      name: error.name || 'Error',
    };
    if (process.env.NODE_ENV === 'development') {
      errorDetails.message = error.message;
    }
    console.error('API request failed.', errorDetails);
    res.status(500).json({
      code: 'internal_error',
      message: 'The request could not be completed.',
    });
  });

  return app;
}
