import assert from 'node:assert/strict';

const origin='https://tired.events';
const expectedRevision=process.env.EXPECTED_CLOUD_RUN_REVISION;

async function request(path,options={}){
 const response=await fetch(new URL(path,origin),{
  redirect:'manual',signal:AbortSignal.timeout(15000),...options
 });
 return response;
}

const checks=[
 ['Healthy Cloud Run revision',async()=>{
  const response=await request('/api/health');
  assert.equal(response.status,200);
  const {status,mode,revision}=await response.json();
  assert.equal(status,'ok');
  assert.equal(mode,'auth-enabled-preview');
  assert.match(revision,/^tired-social-platform-[a-z0-9-]+$/);
  if(expectedRevision)assert.equal(revision,expectedRevision);
  assert.match(response.headers.get('cache-control')??'',/\bno-store\b/);
  return revision;
 }],
 ['Homepage and browser protections',async()=>{
  const response=await request('/',{method:'HEAD'});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')??'',/^text\/html\b/);
  assert.match(response.headers.get('content-security-policy')??'',/frame-ancestors\s+'none'/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 }],
 ['Client bundle',async()=>{
  const response=await request('/app.js',{method:'HEAD'});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type')??'',/^(text|application)\/javascript\b/);
 }],
 ['Google sign-in configuration',async()=>{
  const response=await request('/api/v1/auth/config');
  assert.equal(response.status,200);
  const config=await response.json();
  assert.equal(config.mode,'google');
  assert.equal(config.signInUrl,'/auth/google');
 }],
 ['Shared events require sign-in',async()=>{
  const response=await request('/api/v1/events');
  assert.equal(response.status,401);
  assert.equal((await response.json()).error?.code,'authentication_required');
 }],
 ['Sandbox payment webhook disabled on production',async()=>{
  const response=await request('/api/v1/ticket-webhook',{method:'POST',body:'{}'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error?.code,'sandbox_checkout_unavailable');
 }]
];

const results=await Promise.allSettled(checks.map(([,check])=>check()));
for(const [index,result] of results.entries()){
 const [label]=checks[index];
 if(result.status==='fulfilled'){
  console.log('PASS '+label+(result.value?' ('+result.value+')':''));
 }else{
  process.exitCode=1;
  console.error('FAIL '+label+': '+result.reason.message);
 }
}
