import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {authConfig,googleProvider,digest} from '../server/auth.mjs';
const config={origin:'https://app.example.test',clientId:'test-client',clientSecret:'test-only',redirectUri:'https://app.example.test/auth/google/callback'};
test('Google mode fails closed unless all server configuration is present',()=>{
 assert.equal(authConfig({}),null);
 assert.throws(()=>authConfig({AUTH_MODE:'google'}),/incomplete/);
 const env={AUTH_MODE:'google',PUBLIC_ORIGIN:config.origin,GOOGLE_CLIENT_ID:config.clientId,GOOGLE_CLIENT_SECRET:'test-only',DATABASE_URL:'test-only'};
 assert.equal(authConfig(env).redirectUri,config.redirectUri);
 for(const origin of ['http://app.test','https://app.test/path','https://user@app.test','https://app.test/?x=1']) assert.throws(()=>authConfig({...env,PUBLIC_ORIGIN:origin}));
});
test('Google verification validates signed identity, nonce, audience, issuer, expiration and email',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const client=new OAuth2Client(config.clientId,config.clientSecret,config.redirectUri);
 client.getFederatedSignonCertsAsync=async()=>({certs:{test:publicKey.export({type:'spki',format:'pem'})}});
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://accounts.google.com',aud:config.clientId,sub:'member-1',email_verified:true,name:'Member',nonce:'expected',iat:now,exp:now+600};
 let payload=claims, badSignature=false;
 client.getToken=async options=>{
  assert.equal(options.codeVerifier,'verifier');
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data=`${header}.${body}`;
  return {tokens:{id_token:`${data}.${badSignature?'invalid':sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`}};
 };
 const provider=googleProvider(config,client);
 const url=new URL(provider.authorize({state:'state',nonce:'expected',verifier:'verifier'}));
 assert.equal(url.searchParams.get('code_challenge'),digest('verifier').toString('base64url'));
 assert.equal(url.searchParams.get('state'),'state');assert.equal(url.searchParams.get('nonce'),'expected');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal((await provider.exchange('code','verifier','expected')).subject,'member-1');
 for(const patch of [{aud:'wrong'},{iss:'https://evil.test'},{exp:now-1000},{nonce:'wrong'},{nonce:'éééééééé'},{email_verified:false},{azp:'wrong'},{sub:''}]){
  payload={...claims,...patch};await assert.rejects(provider.exchange('code','verifier','expected'));
 }
 payload=claims;badSignature=true;await assert.rejects(provider.exchange('code','verifier','expected'));
});
