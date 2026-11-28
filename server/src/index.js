import { getConfig } from './config.js';
import { createDatabasePool } from './db.js';
import { createApp } from './app.js';

const config = getConfig();
const pool = createDatabasePool(config);
const app = createApp({ pool, config });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`KonnectX API listening on port ${config.port}.`);
  pool.query('SELECT 1')
    .then(() => console.log('TiDB connection verified.'))
    .catch((error) => {
      console.error('Initial TiDB connection failed.', {
        code: error.code || 'database_error',
      });
    });
});

server.on('error', (error) => {
  console.error('KonnectX API server failed to start.', {
    code: error.code || 'server_error',
    message: error.code === 'EADDRINUSE'
      ? `Port ${config.port} is already in use.`
      : 'The API server could not start.',
  });
  process.exitCode = 1;
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down KonnectX API.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
