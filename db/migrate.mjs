import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDatabasePool } from '../server/database.mjs';

export async function readMigrations(directory = new URL('./migrations/', import.meta.url)) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const migrations = [];
  for (const name of names) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match || Number(match[1]) !== migrations.length + 1) throw new Error('Migration versions must be consecutive from 001');
    const source = await readFile(new URL(name, directory), 'utf8');
    // Version 001 was already committed with an outer transaction. Preserve its bytes
    // for checksums but let this runner commit DDL and history atomically.
    const body = source.replace(/^(?:\s|--[^\n]*\n)*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
    if (!/^(?:\s|--[^\n]*\n)*BEGIN;/i.test(source) || !/COMMIT;\s*$/i.test(source)) throw new Error('Migrations require an outer BEGIN/COMMIT wrapper');
    migrations.push({ version: Number(match[1]), name, body,
      checksum: createHash('sha256').update(source).digest('hex') });
  }
  if (!migrations.length) throw new Error('No migrations found');
  return migrations;
}

export async function migrate(pool, { directory } = {}) {
  const migrations = await readMigrations(directory);
  const client = await pool.connect();
  let locked = false, discard = false;
  try {
    // Session lock spans all migration transactions and serializes release jobs.
    await client.query('SELECT pg_advisory_lock(74192, 1)');
    locked = true;
    const existing = await client.query("SELECT to_regclass('public.app_migration_history') AS history, to_regclass('public.schema_migrations') AS legacy");
    if (!existing.rows[0].history && existing.rows[0].legacy) {
      throw new Error('Untracked legacy schema: inspect and baseline explicitly before migrating');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS app_migration_history (
      version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT version, name, checksum FROM app_migration_history ORDER BY version');
    for (let i = 0; i < rows.length; i++) {
      const saved = rows[i], expected = migrations[i];
      if (!expected || saved.version !== expected.version || saved.name !== expected.name || saved.checksum !== expected.checksum) {
        throw new Error('Migration history mismatch: changed, missing, or unknown version');
      }
    }
    // Both ledgers must agree; never silently skip an out-of-band schema change.
    if (rows.length) {
      const versions = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      if (JSON.stringify(versions.rows.map(r => r.version)) !== JSON.stringify(rows.map(r => r.version))) {
        throw new Error('Schema version ledger mismatch');
      }
    }
    const applied = [];
    for (const migration of migrations.slice(rows.length)) {
      await client.query('BEGIN');
      try {
        await client.query(migration.body);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING', [migration.version]);
        await client.query('INSERT INTO app_migration_history(version,name,checksum) VALUES($1,$2,$3)',
          [migration.version, migration.name, migration.checksum]);
        await client.query('COMMIT');
        applied.push(migration.version);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      }
    }
    return { applied, currentVersion: migrations.at(-1).version };
  } finally {
    if (locked && !discard) {
      try { await client.query('SELECT pg_advisory_unlock(74192, 1)'); } catch { discard = true; }
    }
    client.release(discard);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    pool = createDatabasePool();
    console.log(JSON.stringify({ event: 'migrations_complete', ...await migrate(pool) }));
  } catch {
    console.error('Migration failed; inspect database configuration and migration history. No credentials are logged.');
    process.exitCode = 1;
  } finally { if (pool) await pool.end(); }
}
