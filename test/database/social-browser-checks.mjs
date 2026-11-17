import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
export async function socialBrowserChecks(t,pool){
 if(process.env.TEST_BROWSER!=='1')return;
 await t.test('two browser accounts share PostgreSQL posts, comments and profiles',async()=>{
  const config={origin:''},repo=authRepository(pool);
  const alice=await repo.signIn({issuer:'browser-test',subject:'alice',name:'Browser Alice'});
  const bob=await repo.signIn({issuer:'browser-test',subject:'bob',name:'Browser Bob'});
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),social:createSocialHandler({config,pool})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
   browser=await chromium.launch({headless:true});
   // Only identity bootstrapping is test-only. UI requests, CSRF, APIs and PostgreSQL are real.
   const a=await browser.newPage({extraHTTPHeaders:{cookie:`${SESSION_COOKIE}=${alice.token}`}});
   const b=await browser.newPage({extraHTTPHeaders:{cookie:`${SESSION_COOKIE}=${bob.token}`}});
   const errors=[];for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
   await a.goto(config.origin+'/#community');await b.goto(config.origin+'/#community');
   await a.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   await b.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   if(!await a.getByLabel('Account bio',{exact:true}).isVisible())await a.getByText('Edit shared profile',{exact:true}).click();
   await a.getByLabel('Handle',{exact:true}).fill('browser_alice');
   await a.getByLabel('Account bio',{exact:true}).fill('Persisted shared profile');
   await a.getByRole('button',{name:'Save shared profile',exact:true}).click();
   await a.getByLabel('Shared post',{exact:true}).fill('Persistent browser community post <b>literal</b>');
   await a.getByRole('button',{name:'Publish post',exact:true}).click();
   await a.getByText('Persistent browser community post <b>literal</b>',{exact:true}).waitFor();
   await b.getByRole('button',{name:'Refresh community',exact:true}).click();
   const post=b.getByRole('article').filter({hasText:'Persistent browser community post <b>literal</b>'});
   await post.getByRole('button',{name:'View comments',exact:true}).click();
   assert.equal(await post.getByRole('button',{name:'Delete post',exact:true}).count(),0);
   await post.getByLabel('Shared comment',{exact:true}).fill('Bob comment survives reload');
   await post.getByRole('button',{name:'Publish comment',exact:true}).click();
   await post.getByText('Bob comment survives reload',{exact:false}).waitFor();
   await a.reload();
   const own=a.getByRole('article').filter({hasText:'Persistent browser community post <b>literal</b>'});
   await own.getByRole('button',{name:'View comments',exact:true}).click();
   await own.getByText('Bob comment survives reload',{exact:false}).waitFor();
   if(!await a.getByLabel('Account bio',{exact:true}).isVisible())await a.getByText('Edit shared profile',{exact:true}).click();
   assert.equal(await a.getByLabel('Account bio',{exact:true}).inputValue(),'Persisted shared profile');
   await a.getByLabel('Shared post',{exact:true}).fill('Alice browser private post');
   await a.getByLabel('Who can see this',{exact:true}).selectOption('private');
   await a.getByRole('button',{name:'Publish post',exact:true}).click();
   await a.getByText('Alice browser private post',{exact:true}).waitFor();
   await b.reload();await b.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   assert.equal(await b.getByText('Alice browser private post',{exact:true}).count(),0);
   await b.getByLabel('Find account by handle',{exact:true}).fill('browser_alice');
   await b.getByRole('button',{name:'Find account',exact:true}).click();
   await b.getByRole('button',{name:'Follow',exact:true}).click();
   await b.getByRole('button',{name:'Unfollow',exact:true}).waitFor();
   await b.getByRole('button',{name:'Following accounts',exact:true}).click();
   await b.getByText('Persistent browser community post <b>literal</b>',{exact:true}).waitFor();
   await mkdir('artifacts',{recursive:true});
   await b.evaluate(()=>window.scrollTo(0,0));
   await b.screenshot({path:'artifacts/shared-desktop.png',fullPage:true});
   await b.setViewportSize({width:390,height:844});
   assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Shared community fits mobile');
   await b.evaluate(()=>window.scrollTo(0,0));
   await b.screenshot({path:'artifacts/shared-mobile.png',fullPage:true});
   await b.getByRole('button',{name:'Sign out',exact:true}).click();
   await b.getByRole('heading',{name:'Join your community',exact:true}).waitFor();
   assert.equal(await b.getByText('Persistent browser community post <b>literal</b>',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
  }catch(error){
   if(browser){await mkdir('artifacts',{recursive:true});let i=0;for(const context of browser.contexts())for(const page of context.pages()){
    await page.screenshot({path:`artifacts/shared-failure-${i++}.png`,fullPage:true});
    console.error(await page.locator('main').innerText());
   }}throw error;
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
 });
}
