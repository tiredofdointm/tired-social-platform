import assert from 'node:assert/strict';
import {createServer} from '../../server.mjs';
import {createAuthHandler,SESSION_COOKIE,LOGIN_COOKIE,digest} from '../../server/auth.mjs';
export async function authChecks(t,pool){
 await t.test('OAuth HTTP journey isolates accounts, binds callbacks and revokes sessions',async()=>{
  const attempts=new Map();
  const config={origin:'https://app.example.test'};
  const provider={authorize(attempt){attempts.set(attempt.state,attempt);return `https://accounts.example.test/?state=${attempt.state}`;},async exchange(code,verifier,nonce){
   const attempt=[...attempts.values()].find(a=>a.verifier===verifier);assert.equal(attempt?.nonce,nonce);
   if(code==='invalid')throw new Error('private error');
   return {issuer:'test-oauth',subject:code,name:code};
  }};
  const server=createServer({auth:createAuthHandler({config,pool,provider})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,options={})=>fetch(base+path,{redirect:'manual',...options});
  const cookieValue=(res,name)=>res.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
  async function begin({page,cookie}={}){
   const path=page?'/auth/google?'+new URLSearchParams({next:page}):'/auth/google';
   const res=await request(path,{headers:cookie?{cookie}:{}});
   assert.equal(res.status,302);
   assert.match(res.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
   assert.equal(res.headers.get('referrer-policy'),'no-referrer');
   return {state:new URL(res.headers.get('location')).searchParams.get('state'),cookie:cookieValue(res,LOGIN_COOKIE)};
  }
  const callback=(a,code,extra='',headers={})=>request('/auth/google/callback?'+new URLSearchParams({state:a.state,code}),
   {headers:{cookie:a.cookie+(extra?'; '+extra:''),...headers}});
  try{
   assert.equal((await request('/api/v1/me')).status,401);
   const a=await begin(),b=await begin();
   assert.equal((await callback({...a,cookie:b.cookie},'alice')).status,400);
   const login=await callback(a,'alice');assert.equal(login.status,302);
   const aliceCookie=cookieValue(login,SESSION_COOKIE);assert.ok(aliceCookie);
   assert.equal((await callback(a,'alice')).status,400);
   const bobLogin=await callback(b,'bob'),bobCookie=cookieValue(bobLogin,SESSION_COOKIE);
   const me=async cookie=>{const r=await request('/api/v1/me',{headers:{cookie}});return {status:r.status,body:await r.json()};};
   const alice=await me(aliceCookie),bob=await me(bobCookie);
   assert.equal(alice.body.user.display_name,'alice');assert.equal(bob.body.user.display_name,'bob');assert.notEqual(alice.body.user.id,bob.body.user.id);
   assert.equal('identity_subject' in alice.body.user,false);
   const token=aliceCookie.split('=')[1];
   assert.equal((await pool.query('SELECT count(*)::int n FROM sessions WHERE token_hash=$1',[digest(token)])).rows[0].n,1);
   const logout=(cookie,csrf,origin=config.origin)=>request('/auth/logout',{method:'POST',headers:{cookie,origin,'x-csrf-token':csrf}});
   assert.equal((await logout(aliceCookie,bob.body.csrfToken)).status,403);
   assert.equal((await logout(aliceCookie,alice.body.csrfToken,'https://evil.test')).status,403);
   assert.equal((await logout(aliceCookie,'é'.repeat(43))).status,403);
   assert.equal((await logout(aliceCookie,alice.body.csrfToken)).status,200);
   assert.equal((await me(aliceCookie)).status,401);assert.equal((await me(bobCookie)).status,200);
   const again=await callback(await begin(),'bob',bobCookie);const rotated=cookieValue(again,SESSION_COOKIE);
   assert.equal((await me(bobCookie)).status,401);assert.equal((await me(rotated)).body.user.id,bob.body.user.id);
   await pool.query("UPDATE users SET status='suspended' WHERE id=$1",[bob.body.user.id]);
   assert.equal((await me(rotated)).status,401);assert.equal((await callback(await begin(),'bob')).status,403);
   const expired=await begin();await pool.query("UPDATE oauth_login_attempts SET created_at=now()-interval '20 minutes',expires_at=now()-interval '1 minute' WHERE state_hash=$1",[digest(expired.state)]);
   assert.equal((await callback(expired,'alice')).status,400);
   const failedPage=await callback(expired,'sentinel-private-code','',{accept:'text/html'});
   assert.equal(failedPage.status,400);
   assert.equal(failedPage.headers.get('referrer-policy'),'no-referrer');
   assert.equal(failedPage.headers.get('cache-control'),'no-store');
   assert.match(failedPage.headers.get('content-type'),/^text\/html/);
   const failureHtml=await failedPage.text();
   assert.match(failureHtml,/Try Google sign-in again/);
   assert.doesNotMatch(failureHtml,/sentinel-private-code/);
   assert.equal(failedPage.headers.get('set-cookie'),null);

   const talent=await begin({page:'talent'});
   const events=await begin({page:'shared-events',cookie:talent.cookie});
   assert.equal(talent.cookie,events.cookie);
   assert.notEqual(talent.state,events.state);
   const [talentResult,eventsResult]=await Promise.all([callback(talent,'alice'),callback(events,'alice')]);
   assert.equal(talentResult.headers.get('location'),'/#talent');
   assert.equal(eventsResult.headers.get('location'),'/#shared-events');
   const unsafe=await callback(await begin({page:'https://elsewhere.example/'}),'alice');
   assert.equal(unsafe.headers.get('location'),'/#community');

   const concurrent=await begin();const responses=await Promise.all([callback(concurrent,'alice'),callback(concurrent,'alice')]);assert.deepEqual(responses.map(r=>r.status).sort(),[302,400]);
   const invalid=await callback(await begin(),'invalid');assert.equal(invalid.status,401);assert.equal((await invalid.json()).error.code,'invalid_identity');
   const valid=await callback(await begin(),'alice'),session=cookieValue(valid,SESSION_COOKIE);
   await pool.query("UPDATE sessions SET expires_at=created_at+interval '1 second',created_at=now()-interval '10 minutes' WHERE token_hash=$1",[digest(session.split('=')[1])]);
   // Set expiry in the past after moving creation to preserve the schema constraint.
   await pool.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[digest(session.split('=')[1])]);
   assert.equal((await me(session)).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
}
