import {sandboxBookingFee} from './bookings.mjs';
import {testConnect,providerConnect,providerPayouts} from './provider-connect.mjs';
import {testPayments,ticketWebhook} from './ticket-checkout.mjs';
import {services} from './services.mjs';
import {eventsPlans} from './events-plans.mjs';
import {randomUUID} from 'node:crypto';
import {authRepository,sessionTokenFrom,validMutation} from './auth.mjs';
import {socialRepository} from './social-repository.mjs';
import {transaction} from './database.mjs';
class ApiError extends Error {constructor(status,code){super(code);this.status=status;}}
const fail=(status,code)=>{throw new ApiError(status,code);};
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const blocked=`NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=$1))`;
function fields(body,allowed){if(!body || Array.isArray(body) || typeof body!=='object' || Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'invalid_fields');}
function text(value,max){if(typeof value!=='string'||value.includes('\0')||!value.trim()||Array.from(value.trim()).length>max)fail(400,'invalid_text');return value.trim();}
function visibility(value,values){if(!values.includes(value))fail(400,'invalid_visibility');return value;}
async function readJson(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))fail(415,'json_required');
 let size=0;const chunks=[];
 await new Promise((resolve,reject)=>{
  req.on('data',chunk=>{size+=chunk.length;if(size>16384){reject(new ApiError(413,'body_too_large'));return;}chunks.push(chunk);});
  req.on('end',resolve);req.on('error',()=>reject(new ApiError(400,'invalid_body')));
 });
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'invalid_json');}
}
export function createSocialHandler({config,pool,payments=testPayments(),connect=testConnect(),bookingFeeBps=sandboxBookingFee(connect)}){
 const sessions=authRepository(pool),repo=socialRepository(pool);
 let windowStart=Date.now(),writes=0;
 return async(req,res,url)=>{
  const path=url.pathname;
  const webhook=path==='/api/v1/ticket-webhook';
  if(!webhook && !/^\/api\/v1\/(feed|posts|profiles|follows|blocks|events|plans|services)(\/|$)/.test(path) && path!=='/api/v1/me/profile' && path!=='/api/v1/me/follow-requests')return false;
  const requestId=randomUUID();res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-ID',requestId);
  function send(status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
  try{
   if(webhook){await ticketWebhook({req,pool,payments,fail});send(200,{received:true});return true;}
   const token=sessionTokenFrom(req),user=await sessions.session(token);
   if(!user)fail(401,'authentication_required');
   const actor=user.id,method=req.method;
   if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))fail(405,'method_not_allowed');
   if(method!=='GET'){
    if(!validMutation(req,token,config.origin))fail(403,'invalid_csrf');
    if(Date.now()-windowStart>=60000){windowStart=Date.now();writes=0;}if(++writes>300)fail(429,'rate_limited');
   }
   if(/^\/api\/v1\/(events|plans)(\/|$)/.test(path)){
    await eventsPlans({pool,payments,origin:config.origin,actor,path,method,req,send,fail,readJson,fields,text,uuid,linkedEvent:url.searchParams.get('event')});
    return true;
   }
   if(path==='/api/v1/services/connect/payouts'){
    await providerPayouts({pool,connect,actor,method,send,fail});
    return true;
   }
   if(path==='/api/v1/services/connect'){
    await providerConnect({pool,connect,actor,method,origin:config.origin,send,fail});
    return true;
   }
   if(/^\/api\/v1\/services(\/|$)/.test(path)){
    await services({pool,actor,path,method,req,send,fail,readJson,fields,text,uuid,bookingFeeBps,connect,origin:config.origin});
    return true;
   }
   let match;
   if(path==='/api/v1/feed' && method==='GET'){
    const limit=Number(url.searchParams.get('limit')??20),mode=url.searchParams.get('mode')??'latest';
    if(!Number.isInteger(limit)||limit<1||limit>50||!['latest','following','for-you'].includes(mode))fail(400,'invalid_page');
    let before=null;const cursor=url.searchParams.get('cursor');
    if(cursor){try{before=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{fail(400,'invalid_cursor');}
     if(!before||(before.mode!==undefined?before.mode!==mode:mode==='for-you')||!uuid(before.id)||typeof before.createdAt!=='string'||before.createdAt.length>50||!Number.isFinite(Date.parse(before.createdAt)))fail(400,'invalid_cursor');}
    const rows=await repo.listFeed(actor,{limit,before,mode});
    const last=rows.at(-1);
    const posts=rows.map(({feed_position,...post})=>post);
    send(200,{posts,nextCursor:posts.length===limit?Buffer.from(JSON.stringify({createdAt:last.feed_position,id:last.id,mode})).toString('base64url'):null});
   }else if(path==='/api/v1/me/profile' && method==='PATCH'){
    const body=await readJson(req);fields(body,['handle','display_name','bio','visibility','shareEventAttendance']);
    if(body.shareEventAttendance!==undefined&&typeof body.shareEventAttendance!=='boolean')fail(400,'invalid_attendance_preference');
    if(typeof body.handle!=='string'||!/^[a-z0-9_]{3,30}$/.test(body.handle))fail(400,'invalid_handle');
    if(typeof body.bio!=='string'||body.bio.includes('\0')||Array.from(body.bio).length>500)fail(400,'invalid_bio');
    const name=text(body.display_name,80),v=visibility(body.visibility,['public','private']);
    const result=await pool.query('UPDATE profiles SET handle=$2,display_name=$3,bio=$4,visibility=$5,share_event_attendance=coalesce($6,share_event_attendance) WHERE user_id=$1 RETURNING handle,display_name,bio,visibility,share_event_attendance',[actor,body.handle,name,body.bio,v,body.shareEventAttendance??null]);send(200,{profile:result.rows[0]});
   }else if((match=/^\/api\/v1\/profiles\/([a-z0-9_]{3,30})$/.exec(path)) && method==='GET'){
    const result=await pool.query(`SELECT u.id,p.handle,p.display_name,p.visibility,
     CASE WHEN u.id=$1 OR p.visibility='public' OR f.status='accepted' THEN p.bio ELSE NULL END AS bio,
     f.status AS follow_status FROM users u JOIN profiles p ON p.user_id=u.id
     LEFT JOIN follows f ON f.follower_id=$1 AND f.followed_id=u.id
     WHERE p.handle=$2 AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
     (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))`,[actor,match[1]]);
    if(!result.rowCount)fail(404,'not_found');send(200,{profile:result.rows[0]});
   }else if(path==='/api/v1/posts' && method==='POST'){
    const body=await readJson(req);fields(body,['body','visibility']);send(201,{post:await repo.createPost(actor,{body:text(body.body,2000),visibility:visibility(body.visibility,['public','followers','private'])})});
   }else if((match=/^\/api\/v1\/posts\/([^/]+)$/.exec(path)) && ['GET','PATCH','DELETE'].includes(method)){
    if(!uuid(match[1]))fail(404,'not_found');let post;
    if(method==='GET')post=await repo.getPost(actor,match[1]);
    else if(method==='PATCH'){const body=await readJson(req);fields(body,['body','visibility']);post=await repo.updatePost(actor,match[1],{body:text(body.body,2000),visibility:visibility(body.visibility,['public','followers','private'])});}
    else{const result=await pool.query('UPDATE posts SET deleted_at=now() WHERE id=$2 AND author_id=$1 AND deleted_at IS NULL RETURNING id',[actor,match[1]]);post=result.rows[0];}
    if(!post)fail(404,'not_found');send(200,{post});
   }else if((match=/^\/api\/v1\/posts\/([^/]+)\/comments$/.exec(path)) && ['GET','POST'].includes(method)){
    const id=match[1];if(!uuid(id)||!await repo.getPost(actor,id))fail(404,'not_found');
    if(method==='POST'){
     const body=await readJson(req);fields(body,['body']);const result=await pool.query(`INSERT INTO comments(post_id,author_id,body) SELECT $2,$1,$3 WHERE can_view_post($1,$2) RETURNING id`,[actor,id,text(body.body,500)]);
     if(!result.rowCount)fail(404,'not_found');send(201,{comment:result.rows[0]});
    }else{
     const result=await pool.query(`SELECT c.id,c.author_id,c.body,c.created_at::text,p.handle,p.display_name FROM comments c
      JOIN users u ON u.id=c.author_id JOIN profiles p ON p.user_id=u.id
      WHERE c.post_id=$2 AND c.deleted_at IS NULL AND u.status='active' AND can_view_post($1,$2)
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.author_id) OR (b.blocker_id=c.author_id AND b.blocked_id=$1))
      ORDER BY c.created_at DESC,c.id DESC LIMIT 50`,[actor,id]);send(200,{comments:result.rows.reverse(),limit:50});
    }
   }else if((match=/^\/api\/v1\/posts\/([^/]+)\/reactions\/like$/.exec(path)) && ['PUT','DELETE'].includes(method)){
    if(!uuid(match[1])||!await repo.getPost(actor,match[1]))fail(404,'not_found');
    if(method==='PUT')await pool.query(`INSERT INTO reactions(user_id,post_id) SELECT $1,$2 WHERE can_view_post($1,$2) ON CONFLICT DO NOTHING`,[actor,match[1]]);
    else await pool.query('DELETE FROM reactions WHERE user_id=$1 AND post_id=$2',[actor,match[1]]);send(200,{liked:method==='PUT'});
   }else if(path==='/api/v1/me/follow-requests' && method==='GET'){
    const result=await pool.query(`SELECT u.id,p.handle,p.display_name FROM follows f JOIN users u ON u.id=f.follower_id
     JOIN profiles p ON p.user_id=u.id WHERE f.followed_id=$1 AND f.status='pending' AND u.status='active'
     AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
     ORDER BY f.created_at,u.id LIMIT 50`,[actor]);send(200,{requests:result.rows});
   }else if((match=/^\/api\/v1\/follows\/([^/]+)(\/accept)?$/.exec(path)) && ['PUT','DELETE'].includes(method)){
    const target=match[1];if(!uuid(target)||target===actor)fail(400,'invalid_target');
    const result=await transaction(pool,async db=>{
     // Consistent pair lock order avoids deadlocks with simultaneous reverse follows/blocks.
     await db.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[actor,target]]);
     if(match[2]){
      if(method==='DELETE')return db.query("DELETE FROM follows WHERE follower_id=$2 AND followed_id=$1 AND status='pending' RETURNING status",[actor,target]);
      return db.query(`UPDATE follows SET status='accepted' WHERE follower_id=$2 AND followed_id=$1 AND ${blocked}
       AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='active') RETURNING status`,[actor,target]);
     }
     if(method==='DELETE'){await db.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2',[actor,target]);return {rows:[{status:null}]};}
     return db.query(`INSERT INTO follows(follower_id,followed_id,status)
      SELECT $1,u.id,CASE WHEN p.visibility='private' THEN 'pending' ELSE 'accepted' END FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE u.id=$2 AND u.status='active' AND ${blocked}
      ON CONFLICT(follower_id,followed_id) DO UPDATE SET status=follows.status RETURNING status`,[actor,target]);
    });if(!result.rows.length)fail(404,'not_found');send(200,{follow:result.rows[0]});
   }else if(path==='/api/v1/blocks' && method==='GET'){
    const result=await pool.query(`SELECT u.id,p.handle,p.display_name FROM blocks b JOIN users u ON u.id=b.blocked_id
     JOIN profiles p ON p.user_id=u.id WHERE b.blocker_id=$1 ORDER BY b.created_at,u.id LIMIT 100`,[actor]);send(200,{accounts:result.rows});
   }else if((match=/^\/api\/v1\/blocks\/([^/]+)$/.exec(path)) && ['PUT','DELETE'].includes(method)){
    const target=match[1];if(!uuid(target)||actor===target)fail(400,'invalid_target');
    await transaction(pool,async db=>{
     const users=await db.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[actor,target]]);if(users.rowCount!==2)fail(404,'not_found');
     if(method==='DELETE')await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[actor,target]);
     else{
      await db.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,target]);
      await db.query('DELETE FROM follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',[actor,target]);
     }
    });send(200,{blocked:method==='PUT'});
   }else fail(404,'not_found');
  }catch(error){
   if(path.endsWith('/checkout') && !(error instanceof ApiError)){
    const stripe=typeof error.type==='string' && error.type.startsWith('Stripe');
    const safe=value=>typeof value==='string' && /^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(value)?value:undefined;
    console.error(JSON.stringify({event:'ticket_checkout_failed',requestId,source:stripe?'stripe':'application',
     type:safe(error.type),code:safe(error.code),parameter:safe(error.param),stripeRequestId:safe(error.requestId)}));
    const message=stripe?'Stripe could not open checkout':'The server could not prepare the ticket';
    send(503,{error:{code:'checkout_failed',message:message+' (reference '+requestId+')',requestId}});
    return true;
   }
   const status=error instanceof ApiError?error.status:error.code==='23505'?409:503;
   const code=error instanceof ApiError?error.message:status===409?'conflict':'service_unavailable';send(status,{error:{code,message:code.replaceAll('_',' '),requestId}});
  }
  return true;
 };
}
