import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'sql');

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no esta configurado');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      create table if not exists schema_migrations (
        id bigserial primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const alreadyApplied = await pool.query('select 1 from schema_migrations where name = $1', [file]);
      if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
        console.log(`Skipped migration ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await pool.query('begin');
      try {
        await pool.query(sql);
        await pool.query('insert into schema_migrations (name) values ($1)', [file]);
        await pool.query('commit');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await pool.query('rollback');
        throw error;
      }
    }

    console.log('Migrations completed');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
