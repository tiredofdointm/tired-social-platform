import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { transaction } from './database.mjs';

export const SESSION_COOKIE = '__Host-tired_session';
export const LOGIN_COOKIE = '__Host-tired_login';
const token = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest();
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const csrfFor = value => createHmac('sha256', value).update('tired-csrf-v1').digest('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
class AuthError extends Error { constructor(status, code) { super(code); this.status=status; this.code=code; } }
function cookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function cookies(req) {
 const parsed = new Map();
 for (const part of (req.headers.cookie || '').split(';')) {
  const index=part.indexOf('='); if(index<0) continue;
  const key=part.slice(0,index).trim();
  if(parsed.has(key)) throw new AuthError(400,'invalid_cookie');
  parsed.set(key,part.slice(index+1).trim());
 }
 return parsed;
}
function json(res, status, data) {
 res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 res.end(JSON.stringify(data));
}
const returnPages=new Set(['discover','feed','community','plans','shared-events','talent','studio','settings']);
const returnPage=value=>returnPages.has(value)?value:'community';

function signInError(res,status,code){
 const messages={
  invalid_login_state:'This sign-in attempt expired or was already used. Start a new sign-in.',
  login_not_completed:'Google sign-in was canceled or incomplete.',
  invalid_identity:'Google could not verify this sign-in. Try again.',
  account_unavailable:'This account is unavailable.',
  rate_limited:'Too many sign-in attempts. Wait a minute and try again.'
 };
 const message=messages[code]??'Sign-in is temporarily unavailable. Try again shortly.';
 res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
 res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google sign-in | Tired Events</title><link rel="stylesheet" href="/styles.css"></head>
<body><main class="panel"><h1>Could not complete sign-in</h1><p>${message}</p>
<p><a class="primary" href="/auth/google">Try Google sign-in again</a></p>
<p><a href="/">Return to Tired Events</a></p></main></body></html>`);
}
export function authConfig(env = process.env) {
 if (!env.AUTH_MODE || env.AUTH_MODE==='preview') return null;
 if (env.AUTH_MODE!=='google') throw new Error('Unsupported AUTH_MODE');
 if (!env.PUBLIC_ORIGIN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.DATABASE_URL) throw new Error('Google auth configuration is incomplete');
 const url=new URL(env.PUBLIC_ORIGIN);
 if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin');
 return {origin:url.origin,clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,redirectUri:`${url.origin}/auth/google/callback`};
}
export function googleProvider(config, client = new OAuth2Client({clientId:config.clientId,clientSecret:config.clientSecret,redirectUri:config.redirectUri})) {
 return {
  authorize({state,nonce,verifier}) {
   return client.generateAuthUrl({scope:['openid','profile','email'],access_type:'online',prompt:'select_account',state,nonce,
    code_challenge:digest(verifier).toString('base64url'),code_challenge_method:'S256'});
  },
  async exchange(code, verifier, nonce) {
   const {tokens}=await client.getToken({code,codeVerifier:verifier,redirect_uri:config.redirectUri});
   if(!tokens.id_token) throw new AuthError(401,'invalid_identity');
   const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:config.clientId});
   const claims=ticket.getPayload();
   if(!claims || !same(claims.nonce,nonce) || !['https://accounts.google.com','accounts.google.com'].includes(claims.iss)
      || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>255 || claims.email_verified!==true
      || (claims.azp && claims.azp!==config.clientId)) throw new AuthError(401,'invalid_identity');
   return {issuer:'https://accounts.google.com',subject:claims.sub,name:typeof claims.name==='string'?claims.name:'New member'};
  }
 };
}

export function authRepository(pool) {
 return {
  async begin({state,browser,nonce,verifier,page}) {
   await transaction(pool,async db=>{
    await db.query('DELETE FROM oauth_login_attempts WHERE expires_at<=now()');
    // Retire expired credentials in small batches while retaining the account and session audit history.
    await db.query(`WITH expired AS (
      SELECT id FROM sessions WHERE expires_at<=now() AND token_hash IS NOT NULL
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ) UPDATE sessions s SET token_hash=NULL FROM expired WHERE s.id=expired.id`);
    await db.query(`INSERT INTO oauth_login_attempts(state_hash,browser_hash,nonce,code_verifier,expires_at,return_page)
      VALUES($1,$2,$3,$4,now()+interval '10 minutes',$5)`,[digest(state),digest(browser),nonce,verifier,returnPage(page)]);
   });
  },
  async consume(state,browser) {
   const result=await pool.query(`DELETE FROM oauth_login_attempts WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now()
     RETURNING nonce,code_verifier,return_page`,[digest(state),digest(browser)]);
   return result.rows[0]??null;
  },
  async signIn(identity,oldToken) {
   const sessionToken=token();
   const user=await transaction(pool,async db=>{
    const result=await db.query(`INSERT INTO users(identity_issuer,identity_subject) VALUES($1,$2)
     ON CONFLICT(identity_issuer,identity_subject) DO UPDATE SET identity_subject=EXCLUDED.identity_subject
     RETURNING id,status`,[identity.issuer,identity.subject]);
    const row=result.rows[0]; if(row.status!=='active') throw new AuthError(403,'account_unavailable');
    const name=Array.from(identity.name.trim()||'New member').slice(0,80).join('');
    await db.query(`INSERT INTO profiles(user_id,handle,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING`,
     [row.id,`user_${randomUUID().replaceAll('-','').slice(0,24)}`,name]);
    if(validToken(oldToken)) await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[digest(oldToken)]);
    await db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[row.id,digest(sessionToken)]);
    return row.id;
   });
   return {userId:user,token:sessionToken};
  },
  async session(sessionToken) {
   if(!validToken(sessionToken)) return null;
   const result=await pool.query(`SELECT u.id,p.handle,p.display_name,p.bio,p.visibility,p.share_event_attendance FROM sessions s
    JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'`,[digest(sessionToken)]);
   return result.rows[0]??null;
  },
  async revoke(sessionToken) {
   await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[digest(sessionToken)]);
  }
 };
}

export function createAuthHandler({config,pool,provider=googleProvider(config)}) {
 const repo=authRepository(pool);
 // Bounded per-instance safety cap; production edge rate limits remain a launch gate.
 let windowStart=Date.now(),starts=0,callbacks=0;
 function limit(kind) {
  if(Date.now()-windowStart>=60000){windowStart=Date.now();starts=0;callbacks=0;}
  if((kind==='start'?++starts>60:++callbacks>120)) throw new AuthError(429,'rate_limited');
 }
 return async (req,res,url) => {
  const methods=new Map([['/api/v1/auth/config','GET'],['/auth/google','GET'],['/auth/google/callback','GET'],['/api/v1/me','GET'],['/auth/logout','POST']]);
  if(!methods.has(url.pathname)) return false;
  res.setHeader('Cache-Control','no-store');
  const oauthPage=url.pathname==='/auth/google'||url.pathname==='/auth/google/callback';
  if(oauthPage)res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!==methods.get(url.pathname)){res.setHeader('Allow',methods.get(url.pathname));json(res,405,{error:{code:'method_not_allowed'}});return true;}
  try {
   if(url.pathname==='/api/v1/auth/config'){json(res,200,{mode:'google',signInUrl:'/auth/google'});return true;}
   const jar=cookies(req),sessionToken=jar.get(SESSION_COOKIE);
   if(url.pathname==='/auth/google') {
    limit('start');
    const browserCookie=jar.get(LOGIN_COOKIE);
    const browser=validToken(browserCookie)?browserCookie:token();
    const state=token(),nonce=token(),verifier=token();
    await repo.begin({state,browser,nonce,verifier,page:url.searchParams.get('next')});
    res.setHeader('Set-Cookie',cookie(LOGIN_COOKIE,browser,600));
    res.writeHead(302,{Location:provider.authorize({state,nonce,verifier})});res.end();return true;
   }
   if(url.pathname==='/auth/google/callback') {
    limit('callback');
    const state=url.searchParams.get('state'),browser=jar.get(LOGIN_COOKIE),code=url.searchParams.get('code');
    if(url.searchParams.getAll('state').length!==1 || !validToken(state) || !validToken(browser)) throw new AuthError(400,'invalid_login_state');
    const attempt=await repo.consume(state,browser);
    if(!attempt) throw new AuthError(400,'invalid_login_state');
    if(url.searchParams.has('error') || url.searchParams.getAll('code').length!==1 || !code || code.length>4096) throw new AuthError(400,'login_not_completed');
    let identity;
    try { identity=await provider.exchange(code,attempt.code_verifier,attempt.nonce); }
    catch { throw new AuthError(401,'invalid_identity'); }
    const session=await repo.signIn(identity,sessionToken);
    res.setHeader('Set-Cookie',cookie(SESSION_COOKIE,session.token,7*86400));
    res.writeHead(302,{Location:'/#'+returnPage(attempt.return_page)});res.end();return true;
   }
   const user=await repo.session(sessionToken);
   if(!user) throw new AuthError(401,'authentication_required');
   if(url.pathname==='/api/v1/me'){json(res,200,{user,csrfToken:csrfFor(sessionToken),socialMode:'shared-api'});return true;}
   if(req.headers.origin!==config.origin || !same(req.headers['x-csrf-token'],csrfFor(sessionToken))) throw new AuthError(403,'invalid_csrf');
   await repo.revoke(sessionToken);
   res.setHeader('Set-Cookie',cookie(SESSION_COOKIE,'',0));json(res,200,{signedOut:true});return true;
  } catch(error) {
   const status=error instanceof AuthError?error.status:503;
   const code=error instanceof AuthError?error.code:'authentication_unavailable';
   if(oauthPage&&/\btext\/html\b/i.test(req.headers.accept??''))signInError(res,status,code);
   else json(res,status,{error:{code}});
   return true;
  }
 };
}

export function sessionTokenFrom(req) {try{return cookies(req).get(SESSION_COOKIE);}catch{return null;}}
export function validMutation(req,sessionToken,origin) {return validToken(sessionToken) && req.headers.origin===origin && same(req.headers['x-csrf-token'],csrfFor(sessionToken));}
