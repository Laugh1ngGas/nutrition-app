import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// DATABASE_URL (Neon/Supabase-style hosted Postgres) takes over when set —
// those providers require SSL and don't work with the discrete host/port
// fields below, which stay the default for local/docker-compose Postgres.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mealprepdb',
      user: process.env.DB_USER || 'mealprep_user',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text, duration, rows: res.rowCount });
  return res;
};

export const getClient = async (): Promise<PoolClient> => {
  return await pool.connect();
};

export const testConnection = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('✅ PostgreSQL connected successfully');
  } finally {
    client.release();
  }
};

export default pool;
