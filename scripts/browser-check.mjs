import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {makeSeed,STORAGE_KEY} from '../dist/model.js';
import {createServer} from '../server.mjs';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const legacy=makeSeed();legacy.profile.name='Returning user';legacy.saved=['e1'];
 await page.addInitScript(({key,value})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,value);},{key:STORAGE_KEY,value:JSON.stringify(legacy)});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('heading',{name:'On your radar'}).waitFor();
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).profile.name,STORAGE_KEY),'Returning user');
 await page.getByRole('button',{name:'Saved ✓',exact:true}).waitFor();
 await page.getByRole('button',{name:'Your feed',exact:true}).click();
 await page.getByRole('textbox',{name:'Post text'}).fill('Browser test: meet at eight <script>alert(1)</script>');
 await page.getByRole('button',{name:'Post ↗',exact:true}).click();
 await page.getByText('Browser test: meet at eight <script>alert(1)</script>',{exact:true}).waitFor();
 await page.reload();
 await page.getByText('Browser test: meet at eight <script>alert(1)</script>',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 const explore=page.getByRole('button',{name:'Explore ↗'}).first();
 await page.getByRole('button',{name:'See what’s happening ↓'}).press('Enter');
 await page.getByRole('heading',{name:'On your radar'}).waitFor();
 assert.equal(await page.locator('#events-heading').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Music',pressed:false}).click();
 await page.getByRole('button',{name:'Music',pressed:true}).waitFor();
 await page.getByRole('button',{name:'All',pressed:false}).click();
 await explore.focus();
 await explore.press('Enter');
 await page.getByRole('button',{name:'I’m going',exact:true}).click();
 await page.getByRole('button',{name:'Cancel RSVP',exact:true}).waitFor();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.textContent==='Explore ↗');
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 assert.equal(await page.getByRole('searchbox').count(),0);
 await page.getByLabel('Accent',{exact:true}).selectOption('peach');
 await page.waitForFunction(()=>document.body.dataset.accent==='peach');
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.accent==='lime');
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 assert.equal(await page.getByLabel('Accent',{exact:true}).inputValue(),'lime');
 await page.getByLabel('Theme',{exact:true}).selectOption('light');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 assert.equal(await page.locator('body').getAttribute('data-theme'),'light');
 await page.emulateMedia({colorScheme:'dark'});
 assert.equal(await page.locator('body').getAttribute('data-theme'),'light');
 await page.getByLabel('Theme',{exact:true}).selectOption('system');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.theme==='dark');
 await page.emulateMedia({colorScheme:'light'});
 await page.waitForFunction(()=>document.body.dataset.theme==='light');
 await page.reload();
 assert.equal(await page.getByLabel('Theme',{exact:true}).inputValue(),'system');
 await page.waitForFunction(()=>document.body.dataset.theme==='light');
 await page.getByLabel('Require approval for new event listings').check();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Reset appearance',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.theme==='dark');
 assert.equal(await page.getByLabel('Theme',{exact:true}).inputValue(),'dark');
 await page.reload();
 assert.equal(await page.getByLabel('Display name',{exact:true}).inputValue(),'Returning user');
 assert.equal(await page.getByLabel('Require approval for new event listings').isChecked(),true);
 await page.getByLabel('Theme',{exact:true}).selectOption('light');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Organizer studio',exact:true}).click();
 await page.getByRole('button',{name:'+ Create event',exact:true}).click();
 await page.getByLabel('Event name',{exact:true}).fill('Test event');
 await page.getByLabel('Location',{exact:true}).fill('Test venue');
 await page.getByLabel('Date',{exact:true}).fill('2099-12-01');
 await page.getByRole('button',{name:'Submit for review',exact:true}).click();
 await page.getByRole('button',{name:'Approve',exact:true}).click();
 await page.getByRole('cell',{name:'published',exact:true}).waitFor();
 await page.getByRole('button',{name:'Find talent',exact:true}).click();
 await page.getByRole('button',{name:'View & book ↗'}).first().click();
 await page.getByLabel('Event date').fill('2099-12-01');
 await page.getByRole('button',{name:'Save booking draft',exact:true}).click();
 await page.getByText('Draft only — no provider contacted or payment taken.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Friend plans',exact:true}).click();
 await page.getByRole('button',{name:'+ New plan',exact:true}).click();
 await page.getByLabel('Plan name',{exact:true}).fill('Migration crew plan');
 await page.getByLabel('Date',{exact:true}).fill('2099-12-01');
 await page.getByRole('button',{name:'Save plan',exact:true}).click();
 await page.getByRole('heading',{name:'Migration crew plan',exact:true}).waitFor();
 await page.reload();
 await page.getByRole('heading',{name:'Migration crew plan',exact:true}).waitFor();
 await page.getByRole('button',{name:'Find talent',exact:true}).click();
 await page.getByRole('button',{name:'List your service',exact:true}).click();
 await page.getByLabel('Service name',{exact:true}).fill('Migration photo service');
 await page.getByLabel('About your service',{exact:true}).fill('A local service draft');
 await page.getByRole('button',{name:'Publish service',exact:true}).click();
 await page.getByRole('heading',{name:'Migration photo service',exact:true}).waitFor();
 await page.getByRole('button',{name:'Your feed',exact:true}).click();
 await page.getByRole('button',{name:'Latest',pressed:false}).click();
 await page.getByRole('button',{name:'Latest',pressed:true}).waitFor();
 await page.getByRole('textbox',{name:'Post text'}).fill('Unsent draft');
 await page.getByRole('searchbox',{name:'Search current page'}).fill('Browser test');
 assert.equal(await page.getByRole('textbox',{name:'Post text'}).inputValue(),'Unsent draft');
 await page.getByRole('article').filter({hasText:'Browser test: meet at eight <script>alert(1)</script>'}).getByRole('button',{name:'Comments · 0',exact:true}).click();
 await page.getByLabel('Comment',{exact:true}).fill('Persistent comment <b>literal</b>');
 await page.getByRole('button',{name:'Add comment',exact:true}).click();
 await page.getByText('Persistent comment <b>literal</b>',{exact:true}).waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.reload();
 await page.getByRole('searchbox',{name:'Search current page'}).fill('Browser test');
 await page.getByRole('article').filter({hasText:'Browser test: meet at eight <script>alert(1)</script>'}).getByRole('button',{name:'Comments · 1',exact:true}).click();
 await page.getByText('Persistent comment <b>literal</b>',{exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await mkdir('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No mobile horizontal overflow');
 await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
 // Exercise long, unbroken input through the existing browser-local storage format.
 await page.evaluate(key=>{
  const data=JSON.parse(localStorage.getItem(key));
  data.profile.name='M'.repeat(50);
  const event=data.events.find(event=>event.owner==='You');
  event.title='Long event '+ 'x'.repeat(88);
  event.subtitle='s'.repeat(150);
  event.location='z'.repeat(150);
  data.attending.push(event.id);
  data.plans[0].title='p'.repeat(100);
  data.plans[0].friends='c'.repeat(150);
  localStorage.setItem(key,JSON.stringify(data));
 },STORAGE_KEY);
 const base=new URL(page.url()).origin;
 const headings={
  discover:/Find your people/,
  feed:'A little more connected.',
  plans:'Good plans need good people.',
  studio:'Your next big thing, organized.',
  settings:'Make it feel like you.'
 };
 for(const width of [1440,768,320]){
  await page.setViewportSize({width,height:850});
  for(const [route,heading] of Object.entries(headings)){
   await page.goto(base+'/#'+route);
   if(width===1440&&route==='discover')await page.reload();
   await page.getByRole('heading',{level:1,name:heading}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),route+' fits '+width+'px');
   if(width!==768){
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'artifacts/preview-'+route+'-'+width+'.png'});
   }
   if(width===320&&route==='studio'){
    const tableRegion=page.getByRole('region',{name:'Your events',exact:true});
    assert.equal(await tableRegion.evaluate(el=>el.scrollWidth>el.clientWidth),true);
    await tableRegion.focus();
    await tableRegion.press('End');
    await tableRegion.press('ArrowRight');
    await page.waitForFunction(()=>document.activeElement?.scrollLeft>0);
   }
  }
 }
 // Check all light accents against the surfaces where their text is used.
 const lightContrast=await page.evaluate(()=>{
  function luminance(hex){
   const channels=hex.trim().slice(1).match(/../g).map(pair=>parseInt(pair,16)/255);
   return channels.reduce((sum,c,i)=>sum+[0.2126,0.7152,0.0722][i]*(c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4),0);
  }
  const ratios=[];
  const previous=document.body.dataset.accent;
  for(const accent of ['lime','violet','peach']){
   document.body.dataset.accent=accent;
   const css=getComputedStyle(document.body);
   const foreground=luminance(css.getPropertyValue('--accent-text'));
   for(const surface of ['--bg','--panel','--panel2']){
    ratios.push((luminance(css.getPropertyValue(surface))+0.05)/(foreground+0.05));
   }
  }
  document.body.dataset.accent=previous;
  return Math.min(...ratios);
 });
 assert.ok(lightContrast>=4.5,'Light accent text contrast: '+lightContrast);
 // Account UI uses mocked HTTP only; real OAuth is covered separately and remains a deployment gate.
 let signedIn=false;
 await page.route('**/api/v1/auth/config',route=>route.fulfill({json:{mode:'google'}}));
 await page.route('**/api/v1/me',route=>route.fulfill({status:signedIn?200:401,json:signedIn?{user:{display_name:'Test member'},csrfToken:'test-csrf'}:{error:{code:'authentication_required'}}}));
 await page.route('**/auth/logout',route=>{assert.equal(route.request().headers()['x-csrf-token'],'test-csrf');signedIn=false;return route.fulfill({json:{signedOut:true}});});
 await page.reload();
 await page.getByRole('link',{name:'Sign in with Google'}).waitFor();
 signedIn=true;await page.reload();
 await page.getByText('Signed in: Test member',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Account controls fit mobile');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('link',{name:'Sign in with Google'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Browser journeys passed: legacy storage, post/comment/plan persistence, service listing, draft preservation, dialog Escape, escaped content, RSVP, theme, approval, booking draft, mobile layout.');
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
