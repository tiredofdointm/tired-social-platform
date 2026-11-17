import assert from 'node:assert/strict';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
export async function socialHttpChecks(t,pool){
 await t.test('shared HTTP journey persists two accounts and enforces ownership, privacy and CSRF',async()=>{
  const config={origin:'https://social.example.test'};
  const identities=authRepository(pool);
  const alice=await identities.signIn({issuer:'social-test',subject:'alice',name:'Alice'});
  const bob=await identities.signIn({issuer:'social-test',subject:'bob',name:'Bob'});
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),social:createSocialHandler({config,pool})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(account,path,method='GET',data,headers={}){
   const response=await fetch(base+'/api/v1/'+path,{method,headers:{cookie:account?`${SESSION_COOKIE}=${account.token}`:'',origin:config.origin,'x-csrf-token':account?.csrf??'','content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
   return {status:response.status,data:await response.json()};
  }
  try{
   for(const account of [alice,bob])account.csrf=(await request(account,'me')).data.csrfToken;
   assert.equal((await request(null,'feed')).status,401);
   const profile={handle:'social_alice',display_name:'Alice shared',bio:'Private bio',visibility:'private'};
   assert.equal((await request(alice,'me/profile','PATCH',profile)).status,200);
   assert.equal((await request(bob,'me/profile','PATCH',profile)).status,409);
   assert.equal((await request(bob,'me/profile','PATCH',{...profile,user_id:alice.userId})).status,400);
   assert.equal((await request(bob,'profiles/social_alice')).data.profile.bio,null);
   assert.equal((await request(alice,'posts','POST',{body:'Spoof',visibility:'public',author_id:bob.userId})).status,400);
   assert.equal((await request(alice,'posts','POST',{body:'No csrf',visibility:'public'},{'x-csrf-token':''})).status,403);
   assert.equal((await request(alice,'posts','POST',{body:'Wrong origin',visibility:'public'},{origin:'https://evil.test'})).status,403);
   assert.equal((await request(alice,'posts','POST',{body:'x'.repeat(17000),visibility:'public'})).status,413);
   const post=(await request(alice,'posts','POST',{body:'Shared persistent text <script>safe</script>',visibility:'followers'})).data.post;
   const privatePost=(await request(alice,'posts','POST',{body:'Only Alice',visibility:'private'})).data.post;
   assert.equal((await request(bob,`posts/${post.id}`)).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}`,'PUT')).data.follow.status,'pending');
   assert.equal((await request(bob,`posts/${post.id}/comments`,'POST',{body:'Hidden?'})).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}/accept`,'PUT')).status,404);
   assert.ok((await request(alice,'me/follow-requests')).data.requests.some(p=>p.id===bob.userId));
   assert.equal((await request(alice,`follows/${bob.userId}/accept`,'PUT')).status,200);
   assert.equal((await request(bob,'profiles/social_alice')).data.profile.bio,'Private bio');
   assert.equal((await request(bob,`posts/${post.id}`)).data.post.body,post.body);
   assert.equal((await request(bob,`posts/${privatePost.id}`)).status,404);
   assert.equal((await request(bob,`posts/${post.id}`,'PATCH',{body:'Stolen',visibility:'public'})).status,404);
   assert.equal((await request(bob,`posts/${post.id}`,'DELETE')).status,404);
   assert.equal((await request(bob,`posts/${post.id}/comments`,'POST',{body:'A shared comment'})).status,201);
   assert.equal((await request(alice,`posts/${post.id}/comments`)).data.comments[0].body,'A shared comment');
   await request(bob,`posts/${post.id}/reactions/like`,'PUT');await request(bob,`posts/${post.id}/reactions/like`,'PUT');
   const feed=(await request(bob,'feed?mode=following&limit=1')).data;assert.equal(feed.posts[0].id,post.id);assert.equal(feed.posts[0].likes,1);assert.equal('identity_subject' in feed.posts[0],false);
   assert.equal((await request(bob,'feed?mode=following&cursor='+encodeURIComponent(feed.nextCursor))).data.posts.length,0);
   assert.equal((await request(bob,'feed?cursor=invalid')).status,400);
   assert.equal((await request(bob,'feed?limit=999')).status,400);
   assert.equal((await request(alice,`blocks/${bob.userId}`,'PUT')).status,200);
   assert.ok((await request(alice,'blocks')).data.accounts.some(p=>p.id===bob.userId));
   assert.equal((await request(bob,'blocks')).data.accounts.length,0);
   assert.equal((await request(bob,`posts/${post.id}/comments`)).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}`,'PUT')).status,404);
   assert.equal((await request(bob,'profiles/social_alice')).status,404);
   assert.equal((await request(alice,`posts/${post.id}/comments`)).data.comments.length,0);
   assert.equal((await request(bob,'feed?mode=following')).data.posts.length,0);
   await request(alice,`blocks/${bob.userId}`,'DELETE');
   assert.equal((await request(bob,`posts/${post.id}`)).status,404,'unblocking never restores accepted follow');
   assert.equal((await request(alice,`posts/${post.id}`,'PATCH',{body:'Now public',visibility:'public'})).status,200);
   assert.equal((await request(bob,`posts/${post.id}`)).data.post.body,'Now public');
   await request(alice,`posts/${post.id}`,'DELETE');assert.equal((await request(alice,`posts/${post.id}`)).status,404);
   await pool.query("UPDATE users SET status='suspended' WHERE id=$1",[bob.userId]);
   assert.equal((await request(bob,'posts','POST',{body:'Suspended',visibility:'public'})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
}
