import Stripe from 'stripe';
import {transaction} from './database.mjs';

export function testConnect(env=process.env){
 if(env.STRIPE_CONNECT_TEST_ENABLED!=='1')return null;
 if(!env.STRIPE_TEST_SECRET_KEY?.startsWith('sk_test_'))throw Error('Stripe Connect requires a sandbox key');
 return new Stripe(env.STRIPE_TEST_SECRET_KEY,{timeout:5000,maxNetworkRetries:0});
}

export async function providerConnect({pool,connect,actor,method,origin,send,fail}){
 if(!connect)return send(200,{enabled:false});
 if(!['GET','POST'].includes(method))fail(405,'method_not_allowed');
 const result=await transaction(pool,async db=>{
  const provider=await db.query(`SELECT id FROM users WHERE id=$1 AND status='active'
   AND EXISTS(SELECT 1 FROM service_listings WHERE owner_id=$1 AND publication='published' AND withdrawn_at IS NULL)
   FOR NO KEY UPDATE`,[actor]);
  if(!provider.rowCount)return {enabled:true,eligible:false};

  const existing=await db.query('SELECT stripe_account_id FROM provider_connect_accounts WHERE provider_id=$1',[actor]);
  let accountId=existing.rows[0]?.stripe_account_id;
  if(!accountId && method==='POST'){
   const account=await connect.accounts.create({country:'US',
    controller:{fees:{payer:'application'},losses:{payments:'application'},requirement_collection:'stripe',stripe_dashboard:{type:'express'}},
    capabilities:{transfers:{requested:true}}
   },{idempotencyKey:'sandbox-provider-'+actor});
   accountId=account.id;
   await db.query('INSERT INTO provider_connect_accounts(provider_id,stripe_account_id) VALUES($1,$2)',[actor,accountId]);
  }
  return {enabled:true,eligible:true,accountId};
 });
 if(!result.accountId)return send(200,{enabled:result.enabled,eligible:result.eligible,connected:false});

 const account=await connect.accounts.retrieve(result.accountId);
 const status={enabled:true,eligible:true,connected:true,detailsSubmitted:account.details_submitted===true,
  transfersEnabled:account.capabilities?.transfers==='active',payoutsEnabled:account.payouts_enabled===true};
 if(method==='GET')return send(200,status);

 const returnUrl=origin+'/#talent';
 const link=await connect.accountLinks.create({account:result.accountId,type:'account_onboarding',return_url:returnUrl,refresh_url:returnUrl});
 if(new URL(link.url).origin!=='https://connect.stripe.com')fail(503,'onboarding_unavailable');
 return send(200,{...status,url:link.url});
}
