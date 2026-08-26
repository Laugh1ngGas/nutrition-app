import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

// DATABASE_URL lets this run against a hosted Postgres (Neon/Supabase) —
// those require SSL, unlike local/docker-compose Postgres.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

async function migrate() {
  const sqlPath = path.join(__dirname, 'migrate.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const client = await pool.connect();
  try {
    console.log('🚀 Running database migrations...');
    await client.query(sql);
    console.log('✅ Migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
