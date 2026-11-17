import { socialBrowserChecks } from './social-browser-checks.mjs';
import { socialHttpChecks } from './social-http-checks.mjs';
import { authChecks } from './auth-checks.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDatabasePool, transaction } from '../../server/database.mjs';
import { migrate } from '../../db/migrate.mjs';
import { socialRepository } from '../../server/social-repository.mjs';

// Requires an empty disposable database. Never run against staging/production.
test('migration runner and parameterized social access', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL must identify a disposable database');
  const pool = createDatabasePool(process.env.TEST_DATABASE_URL);
  t.after(() => pool.end());
  assert.equal((await pool.query("SELECT to_regclass('public.users') AS table_name")).rows[0].table_name, null,
    'Integration suite refuses to run on an initialized database');
  const directory = await mkdtemp(`${tmpdir()}/tired-migrations-`);
  const url = pathToFileURL(`${directory}/`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const initial = await readFile(new URL('../../db/migrations/001_identity_social.sql', import.meta.url), 'utf8');
  await writeFile(new URL('001_identity_social.sql', url), initial);
  await writeFile(new URL('002_oauth_attempts.sql', url), await readFile(new URL('../../db/migrations/002_oauth_attempts.sql', import.meta.url)));

  await t.test('concurrent release jobs apply each migration once; repeat is a no-op', async () => {
    const results = await Promise.all([migrate(pool), migrate(pool)]);
    assert.deepEqual(results.map(r => r.applied.length).sort(), [0, 2]);
    assert.deepEqual(await migrate(pool), { applied: [], currentVersion: 2 });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
  });
  await t.test('changed, unknown and inconsistent versions fail closed', async () => {
    await writeFile(new URL('001_identity_social.sql', url), '-- changed\n' + initial);
    await assert.rejects(migrate(pool, { directory: url }), /history mismatch/);
    await writeFile(new URL('001_identity_social.sql', url), initial);
    await pool.query("INSERT INTO app_migration_history(version,name,checksum) VALUES(3,'unknown','unknown')");
    await assert.rejects(migrate(pool), /history mismatch/);
    await pool.query('DELETE FROM app_migration_history WHERE version=3');
    await pool.query('INSERT INTO schema_migrations(version) VALUES(7)');
    await assert.rejects(migrate(pool), /ledger mismatch/);
    await pool.query('DELETE FROM schema_migrations WHERE version=7');
  });
  await t.test('failed DDL rolls back with its version; a corrected new migration can retry', async () => {
    await writeFile(new URL('003_test.sql', url), 'BEGIN;\nCREATE TABLE rollback_probe(id integer);\nSELECT 1/0;\nCOMMIT;\n');
    await assert.rejects(migrate(pool, { directory: url }));
    assert.equal((await pool.query("SELECT to_regclass('public.rollback_probe') AS t")).rows[0].t, null);
    assert.equal((await pool.query('SELECT max(version) AS v FROM app_migration_history')).rows[0].v, 2);
    await writeFile(new URL('003_test.sql', url), 'BEGIN;\nCREATE TABLE rollback_probe(id integer);\nCOMMIT;\n');
    assert.deepEqual((await migrate(pool, { directory: url })).applied, [3]);
    // Remove only this suite's deliberate probe, retaining the actual app schema.
    await pool.query('DROP TABLE rollback_probe');
    await pool.query('DELETE FROM app_migration_history WHERE version=3');
    await pool.query('DELETE FROM schema_migrations WHERE version=3');
  });
  await t.test('transaction rollback is atomic and releases the connection', async () => {
    await assert.rejects(transaction(pool, async client => {
      await client.query("INSERT INTO users(identity_issuer,identity_subject) VALUES('test','rollback')");
      throw new Error('Abort fixture');
    }), /Abort fixture/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
  });

  let a, b;
  await transaction(pool, async client => {
    const rows = (await client.query("INSERT INTO users(identity_issuer,identity_subject) VALUES('test','a'),('test','b') RETURNING id")).rows;
    [a, b] = rows.map(r => r.id);
    await client.query("INSERT INTO profiles(user_id,handle,display_name) VALUES($1,'alice','Alice'),($2,'bob','Bob')", [a, b]);
  });
  const repo = socialRepository(pool);
  await t.test('input stays data; actor ownership, visibility and blocks are enforced', async () => {
    const payload = "quote '); DROP TABLE users; --";
    const post = await repo.createPost(a, { body: payload, visibility: 'followers' });
    assert.equal((await repo.getPost(a, post.id)).body, payload);
    assert.equal(await repo.getPost(b, post.id), null);
    assert.equal(await repo.getPost(null, post.id), null);
    await pool.query("INSERT INTO follows(follower_id,followed_id,status) VALUES($1,$2,'pending')", [b, a]);
    assert.equal(await repo.getPost(b, post.id), null);
    await pool.query("UPDATE follows SET status='accepted' WHERE follower_id=$1 AND followed_id=$2", [b, a]);
    assert.equal((await repo.getPost(b, post.id)).id, post.id);
    assert.equal(await repo.updatePost(b, post.id, { body: 'stolen', visibility: 'public' }), null);
    await pool.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)', [b, a]);
    assert.equal(await repo.getPost(b, post.id), null);
    assert.deepEqual(await repo.listFeed(b), []);
    await pool.query('DELETE FROM blocks WHERE blocker_id=$1', [b]);
    await pool.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)', [a, b]);
    assert.equal(await repo.getPost(b, post.id), null);
    await pool.query('DELETE FROM blocks WHERE blocker_id=$1', [a]);
    assert.equal((await repo.updatePost(a, post.id, { body: 'private now', visibility: 'private' })).body, 'private now');
    assert.equal(await repo.getPost(b, post.id), null);
    await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [a]);
    assert.equal(await repo.getPost(a, post.id), null);
    await assert.rejects(repo.createPost(a, { body: 'blocked' }), /Active actor/);
    assert.equal(await repo.updatePost(a, post.id, { body: 'blocked', visibility: 'public' }), null);
    await pool.query("UPDATE users SET status='active' WHERE id=$1", [a]);
  });
  await t.test('feed uses bounded, stable microsecond cursor pagination and public DTOs', async () => {
    await transaction(pool, async client => {
      for (let i = 0; i < 3; i++) await socialRepository(client).createPost(a, { body: `page ${i}` });
    });
    const first = await repo.listFeed(null, { limit: 2 });
    const second = await repo.listFeed(null, { limit: 2, before: { createdAt: first[1].created_at, id: first[1].id } });
    assert.equal(first.length, 2); assert.equal(second.length, 1);
    assert.equal(new Set([...first, ...second].map(p => p.id)).size, 3);
    assert.equal('identity_subject' in first[0], false);
    assert.equal('token_hash' in first[0], false);
    await assert.rejects(repo.listFeed(null, { limit: 101 }), /page size/);
  });
  await authChecks(t,pool);
  await socialHttpChecks(t,pool);
  await socialBrowserChecks(t,pool);
});
