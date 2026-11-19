import Stripe from 'stripe';

export const LIVE_BOOKING_FEE_BPS = 750;

export const sandboxRecords = Object.freeze({
  accounts: 'provider_connect_accounts', payments: 'booking_payments', live: false
});
export const liveRecords = Object.freeze({
  accounts: 'live_provider_connect_accounts', payments: 'live_booking_payments', live: true
});

export async function liveBookingConfig(origin, env = process.env) {
  const key = env.STRIPE_LIVE_BOOKING_KEY;
  const signingSecret = env.STRIPE_LIVE_BOOKING_WEBHOOK;
  if (!key && !signingSecret) return null;
  if (origin !== 'https://tired.events' || !/^(sk|rk)_live_/.test(key ?? '') ||
      !signingSecret?.startsWith('whsec_') || !/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_LIVE_PLATFORM_ACCOUNT ?? '') ||
      env.STRIPE_TEST_SECRET_KEY || env.STRIPE_TEST_WEBHOOK_SECRET || env.STRIPE_CONNECT_TEST_ENABLED) {
    throw Error('Invalid live booking configuration');
  }
  const connect = new Stripe(key, {timeout: 5000, maxNetworkRetries: 1});
  const account = await connect.accounts.retrieve();
  if (account.id !== env.STRIPE_LIVE_PLATFORM_ACCOUNT || account.charges_enabled !== true) {
    throw Error('Live booking merchant verification failed');
  }
  return {
    connect, ticketPayments: {live:true,sessions:connect.checkout.sessions,refunds:connect.refunds,accounts:connect.accounts}, records: liveRecords, bookingFeeBps: LIVE_BOOKING_FEE_BPS,
    verifyLiveBooking: (body, signature) => connect.webhooks.constructEvent(body, signature, signingSecret)
  };
}
