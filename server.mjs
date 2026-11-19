import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const assets = new Map([
 ['/', ['index.html', 'text/html; charset=utf-8']],
 ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
 ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
export function createServer({auth=null,social=null} = {}) {
 return http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end('Bad request'); }
  const path=url.pathname;
  if(auth && await auth(req,res,url)) return;
  if(social && await social(req,res,url)) return;
  if (!['GET', 'HEAD'].includes(req.method)) {
   res.writeHead(405, {'Allow':'GET, HEAD'}); return res.end('Method not allowed');
  }
  if(path==='/api/v1/auth/config') {
   res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
   return res.end(req.method==='HEAD'?undefined:JSON.stringify({mode:'preview'}));
  }
  // Cloud Run reserves some paths ending in z. Use /api/health for external probes.
  if (path === '/api/health' || path === '/healthz') {
   res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
   return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({status:'ok', mode:auth?'auth-enabled-preview':'local-demo', version:'0.1.0', ...(process.env.K_REVISION?{revision:process.env.K_REVISION}:{})}));
  }
  const asset = assets.get(path);
  if (!asset) {res.writeHead(404); return res.end('Not found');}
  try {
   const data = await readFile(new URL('./dist/' + asset[0], import.meta.url));
   res.writeHead(200, {'Content-Type':asset[1], 'Cache-Control':'no-cache'});
   if (req.method === 'HEAD') return res.end();
   if (path === '/' && auth) {
    return res.end(data.toString('utf8').replace('data-home="discover"', 'data-home="community"'));
   }
   res.end(data);
  } catch {res.writeHead(500); res.end('Unable to load application');}
 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const port = Number(process.env.PORT || 8080);
 const {authConfig,createAuthHandler}=await import('./server/auth.mjs');
 const config=authConfig();
 let pool,auth,social;
 if(config) {
  const {createDatabasePool}=await import('./server/database.mjs');
  pool=createDatabasePool(); auth=createAuthHandler({config,pool});
  const {createSocialHandler}=await import('./server/social-http.mjs');
  const {liveBookingConfig}=await import('./server/live-booking-config.mjs');
  const live=await liveBookingConfig(config.origin);
  social=createSocialHandler({config,pool,...live});
 }
 const server=createServer({auth,social}).listen(port,'0.0.0.0',()=>console.log(JSON.stringify({event:'server_started',port})));
 for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>{
  server.close(async()=>{if(pool) await pool.end();});
 });
}
