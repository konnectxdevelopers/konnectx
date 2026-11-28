import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

export function createDatabasePool(config) {
  const url = new URL(config.databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!url.hostname || !url.username || !database) {
    throw new Error('DATABASE_URL must include a host, user, and database.');
  }

  const ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  if (config.databaseCaFile) {
    ssl.ca = readFileSync(config.databaseCaFile, 'utf8');
  }

  return mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    decimalNumbers: true,
  });
}
