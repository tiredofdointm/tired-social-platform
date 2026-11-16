import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const assets = new Map([
 ['/', ['index.html', 'text/html; charset=utf-8']],
 ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
 ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);
export function createServer() {
 return http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (!['GET', 'HEAD'].includes(req.method)) {
   res.writeHead(405, {'Allow':'GET, HEAD'}); return res.end('Method not allowed');
  }
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); return res.end('Bad request'); }
  if (path === '/healthz') {
   res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
   return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({status:'ok', mode:'local-demo', version:'0.1.0'}));
  }
  const asset = assets.get(path);
  if (!asset) {res.writeHead(404); return res.end('Not found');}
  try {
   const data = await readFile(new URL('./dist/' + asset[0], import.meta.url));
   res.writeHead(200, {'Content-Type':asset[1], 'Cache-Control':'no-cache'});
   res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(500); res.end('Unable to load application');}
 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const port = Number(process.env.PORT || 8080);
 createServer().listen(port, '0.0.0.0', () => console.log(JSON.stringify({event:'server_started',port})));
}
