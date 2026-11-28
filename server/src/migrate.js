import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { createDatabasePool } from './db.js';
import { migrateLegacyProfileServices } from './migrate-services.js';
import { migrateProfileListingsAndReport } from './migrate-listings.js';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const pool = createDatabasePool(getConfig());

try {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version VARCHAR(255) NOT NULL PRIMARY KEY,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );

  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d+[-_].+\.sql$/.test(name))
    .sort();

  for (const file of files) {
    const version = basename(file);
    const [existing] = await pool.execute(
      'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
      [version]
    );
    if (existing.length) {
      console.log(`Skipping applied migration ${version}.`);
      continue;
    }

    const sql = await readFile(join(migrationDirectory, file), 'utf8');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }
    await pool.execute(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [version]
    );
    console.log(`Applied migration ${version}.`);
  }

  const serviceReport = await migrateLegacyProfileServices(pool);
  console.log('Legacy profile services migration report:', JSON.stringify(serviceReport));
  const listingReport = await migrateProfileListingsAndReport(pool);
  console.log('Unified listing backfill report:', JSON.stringify(listingReport));
} catch (error) {
  console.error('Database migration failed.', {
    code: error.code || 'migration_error',
    message: error.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
