import pg from 'pg';

// Instantiate only in server/release code. No implicit localhost or demo fallback.
export function createDatabasePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 30000,
    options: '-c search_path=public' });
  // Never log connection strings, SQL, or parameters.
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_idle_connection_error' })));
  return pool;
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
