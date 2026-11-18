#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
commit=$(git rev-parse HEAD)
bash scripts/stage-sandbox.sh "$commit"

node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const origin = 'https://ticket-test---tired-social-platform-y3dmxghtqa-ew.a.run.app';
const request = (path, options={}) => fetch(origin+path, {redirect:'manual', signal:AbortSignal.timeout(15000), ...options});
const login = await request('/auth/google?next=talent');
assert.equal(login.status,302,'Google sign-in did not start.');
const google = new URL(login.headers.get('location'));
assert.equal(google.origin,'https://accounts.google.com');
assert.equal(google.searchParams.get('redirect_uri'),origin+'/auth/google/callback');
assert.equal(login.headers.get('referrer-policy'),'no-referrer');
const retry = await request('/auth/google/callback', {headers:{Accept:'text/html'}});
assert.equal(retry.status,400);
assert.match(retry.headers.get('content-type'),/^text\/html/);
assert.equal(retry.headers.get('referrer-policy'),'no-referrer');
assert.ok((await retry.text()).includes('href="/auth/google"'),'Missing sign-in retry link.');
const webhook = await request('/api/v1/ticket-webhook',{method:'POST',body:'{}'});
assert.equal(webhook.status,400);
assert.equal((await webhook.json()).error?.code,'invalid_signature');
console.log('Sandbox sign-in start, recovery page and unsigned webhook checks passed.');
JS
bash scripts/inspect-sandbox-payout-readiness.sh "$@"
