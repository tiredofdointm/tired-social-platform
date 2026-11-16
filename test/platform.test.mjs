import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {rankPosts,toggleItem,calculateQuote,validateEvent,makeSeed} from '../dist/model.js';
test('quote uses integer cents and rejects invalid durations',()=>{
 assert.deepEqual(calculateQuote(150,2),{subtotal:30000,fee:3000,total:33000});
 assert.deepEqual(calculateQuote(19.99,3),{subtotal:5997,fee:600,total:6597});
 for(const h of [0,-1,1.5,13,NaN])assert.throws(()=>calculateQuote(150,h));
});
test('following feed does not include unfollowed authors',()=>{
 const posts=[{author:'A',createdAt:100,likes:10},{author:'B',createdAt:200,likes:0},{author:'You',createdAt:300,likes:0}];
 assert.deepEqual(rankPosts(posts,['A'],'following').map(p=>p.author),['You','A']);
 assert.equal(posts[0].author,'A');
});
test('toggle is reversible without duplicating IDs',()=>{
 const original=['e1'];assert.deepEqual(toggleItem(toggleItem(original,'e2'),'e2'),original);
 assert.deepEqual(original,['e1']);
});
test('event validation rejects invalid capacity and price',()=>{
 const e={title:'Event',location:'LA',date:'2026-12-01',price:20,capacity:10};
 assert.equal(validateEvent(e),null);
 assert.ok(validateEvent({...e,capacity:1.5}));
 assert.ok(validateEvent({...e,price:-1}));
 assert.ok(validateEvent({...e,date:'invalid'}));
 assert.ok(validateEvent({...e,title:' '}));
});
test('seed dates follow the supplied clock',()=>{
 const s=makeSeed(Date.parse('2026-11-16T12:00:00Z'));
 assert.equal(s.events[0].date,'2026-11-21');
 assert.equal(s.prefs.review,false);
});
test('HTTP serves app and health, blocks private paths and mutations',async t=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const origin='http://127.0.0.1:'+server.address().port;
 const page=await fetch(origin);assert.equal(page.status,200);assert.match(await page.text(),/app\.js/);
 assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
 const health=await fetch(origin+'/healthz');assert.equal((await health.json()).mode,'local-demo');
 for(const path of ['/server.mjs','/.env','/package.json','/missing'])assert.equal((await fetch(origin+path)).status,404);
 assert.equal((await fetch(origin,{method:'POST',body:'x'})).status,405);
 assert.equal((await fetch(origin,{method:'HEAD'})).status,200);
});
