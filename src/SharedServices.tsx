import {useEffect, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';

const categories = ['Photography', 'DJ', 'Security', 'Other'];
type Listing = {id:string; title:string; category:string; description:string};
type DirectoryEntry = Listing & {display_name:string; handle:string; owned:boolean; availability:{id:string;start:string}[]};
type BookingQuote = {serviceCents:number;feeCents:number;totalCents:number};
const usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
type Booking = {request_id:string; starts_at:string; title:string; counterpart:string; provider:boolean; confirmed:boolean;quote:BookingQuote|null;payment_state:string|null};
type Publication = 'published' | 'pending' | 'rejected';
type Publishing = {
  manual_review:boolean;
  admin:boolean;
  mine:(Listing & {publication:Publication})[];
  pending:(Listing & {handle:string})[];
};
type View =
  | {kind:'loading' | 'preview' | 'signed-out' | 'error'}
  | {kind:'ready'; csrf:string; listings:DirectoryEntry[]; bookings:Booking[]; quotesEnabled:boolean; publishing:Publishing};

class DirectoryError extends Error {
  constructor(readonly status:number) { super('Could not load or save services.'); }
}

async function get<T>(resource:string, signal:AbortSignal):Promise<T> {
  const response = await fetch('/api/v1/' + resource, {signal});
  if (!response.ok) throw new DirectoryError(response.status);
  return response.json();
}

export function SharedServices({preview, onPreviewMode}:{
  preview:ReactNode;
  onPreviewMode:(preview:boolean)=>void;
}) {
  const [view, setView] = useState<View>({kind:'loading'});
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState('All categories');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const {signal} = controller;
    async function load() {
      try {
        const config = await get<{mode:string}>('auth/config', signal);
        if (signal.aborted) return;
        onPreviewMode(config.mode === 'preview');
        if (config.mode === 'preview') {
          setView({kind:'preview'});
          return;
        }
        const session = await get<{csrfToken:string}>('me', signal);
        const [directory, publishing, reservations] = await Promise.all([
          get<{listings:DirectoryEntry[]}>('services', signal),
          get<Publishing>('services/publishing', signal),
          get<{bookings:Booking[];quotesEnabled:boolean}>('services/bookings', signal),
        ]);
        if (!signal.aborted) setView({kind:'ready', csrf:session.csrfToken, listings:directory.listings, bookings:reservations.bookings,quotesEnabled:reservations.quotesEnabled, publishing});
      } catch (error) {
        if (!signal.aborted) setView({kind:error instanceof DirectoryError && error.status === 401 ? 'signed-out' : 'error'});
      }
    }
    function accountChanged() {
      controller.abort();
      setView({kind:'signed-out'});
      setMessage('');
    }
    void load();
    window.addEventListener('tired-account-change', accountChanged);
    return () => {
      controller.abort();
      window.removeEventListener('tired-account-change', accountChanged);
    };
  }, [refresh, onPreviewMode]);

  async function change(path:string, method:string, body:unknown, success:(result:{publication?:Publication})=>string) {
    if (view.kind !== 'ready' || busy) return false;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/services' + path, {
        method,
        headers:{'Content-Type':'application/json', 'X-CSRF-Token':view.csrf},
        body:body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401) {
        setView({kind:'signed-out'});
        return false;
      }
      if (response.status === 409) {
        const problem = await response.json();
        setMessage(problem.error?.code === 'active_bookings' ? 'Resolve upcoming bookings before withdrawing this listing.' : 'This time is unavailable. Check your bookings and choose another time.');
        setRefresh(value => value + 1);
        return false;
      }
      if (!response.ok) {
        setMessage(response.status === 404 ? 'That listing is no longer available. The list has been refreshed.' : 'Could not save the change.');
        if (response.status === 404) setRefresh(value => value + 1);
        return false;
      }
      setMessage(success(await response.json()));
      setRefresh(value => value + 1);
      return true;
    } catch {
      setMessage('Could not save the change. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await change('', 'POST', {
      title:fields.get('title'), category:fields.get('category'), description:fields.get('description'),
    }, result => result.publication === 'pending' ? 'Service submitted for review.' : 'Service published.');
    if (saved) form.reset();
  }

  if (view.kind === 'preview') return preview;
  if (view.kind === 'loading') return <p role="status">Loading services…</p>;
  if (view.kind === 'error') return <section className="panel">
    <p role="alert">Could not load shared services.</p>
    <button onClick={() => {setView({kind:'loading'}); setRefresh(value => value + 1);}}>Try again</button>
  </section>;
  if (view.kind === 'signed-out') return <section className="panel">
    <h1>Find talent</h1><p>Sign in to browse providers and list your services.</p>
    <a className="primary" href="/auth/google">Sign in with Google</a>
  </section>;
  if (view.kind !== 'ready') return null;

  const {publishing, listings} = view;
  const search = query.trim().toLowerCase();
  const matches = listings.filter(item =>
    (category === 'All categories' || item.category === category) &&
    [item.title, item.description, item.display_name, item.handle].some(value => value.toLowerCase().includes(search)));

  return <section className="shared-community provider-directory stack">
    <h1>Find talent</h1>
    <p role="status">{message}</p>
    <ProviderConnect csrf={view.csrf}/>
    <details className="panel">
      <summary>List your service</summary>
      <form onSubmit={event => void submit(event)}>
        <label>Service title<input name="title" required maxLength={120}/></label>
        <label>Category<select name="category" required>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Description<textarea name="description" required maxLength={1000}/></label>
        <button className="primary" disabled={busy}>{publishing.manual_review ? 'Submit for review' : 'Publish service'}</button>
      </form>
    </details>
    {publishing.mine.length > 0 && <details className="panel">
      <summary>Your listings</summary>
      {publishing.mine.map(item => <article key={item.id}>
        <h3>{item.title}</h3><p>{item.category} · {item.publication}</p>
        <button disabled={busy} aria-label={`Withdraw ${item.title}`} onClick={() => void change('/' + item.id, 'DELETE', undefined, () => 'Service withdrawn.')}>Withdraw</button>
      </article>)}
    </details>}
    {publishing.admin && <section className="panel">
      <h2>Service publishing</h2>
      <p>{publishing.manual_review ? 'New services require approval.' : 'New services publish automatically.'}</p>
      <button disabled={busy} onClick={() => void change('/publishing', 'PUT',
        {manualReview:!publishing.manual_review}, () => 'Service publishing policy saved.')}>
        {publishing.manual_review ? 'Enable automatic publishing' : 'Require manual review'}
      </button>
      {publishing.pending.length > 0 && <h3>Pending services</h3>}
      {publishing.pending.map(item => <article key={item.id}>
        <h3>{item.title}</h3><p>{item.category} · @{item.handle}</p><p className="post-text">{item.description}</p>
        <div className="actions">
          <button disabled={busy} aria-label={`Approve ${item.title}`} onClick={() => void change('/' + item.id + '/review', 'PUT',
            {decision:'published'}, () => 'Service approved.')}>Approve</button>
          <button disabled={busy} aria-label={`Reject ${item.title}`} onClick={() => void change('/' + item.id + '/review', 'PUT',
            {decision:'rejected'}, () => 'Service rejected.')}>Reject</button>
        </div>
      </article>)}
    </section>}
    {view.bookings.length > 0 && <section className="panel"><h2>Your bookings</h2>
      {view.bookings.map(booking => <article key={booking.request_id}>
        <h3>{booking.title}</h3>
        <p>{new Date(booking.starts_at).toLocaleString()} · 1 hour · {booking.counterpart}</p>
        <p>{booking.confirmed ? 'Confirmed' : 'Awaiting provider approval'}</p>
        {booking.quote && <dl>
          <dt>Sandbox service price</dt><dd>{usd.format(booking.quote.serviceCents/100)}</dd>
          <dt>Platform fee</dt><dd>{usd.format(booking.quote.feeCents/100)}</dd>
          <dt>Total quote</dt><dd>{usd.format(booking.quote.totalCents/100)}</dd>
        </dl>}
        {booking.quote && <BookingCheckout booking={booking} csrf={view.csrf}/>}
        {Date.parse(booking.starts_at)>Date.now() && <div className="actions">
          {booking.provider && !booking.confirmed && <form onSubmit={event=>{
            event.preventDefault();
            const amount=new FormData(event.currentTarget).get('price');
            void change('/bookings/'+booking.request_id+'/confirm','POST',
              amount?{servicePriceCents:Math.round(Number(amount)*100)}:undefined,()=>'Booking confirmed.');
          }}>
            {view.quotesEnabled && <label>Sandbox service price (USD, optional)<input name="price" type="number" min="0.50" max="999999.99" step="0.01"/></label>}
            <button disabled={busy}>Confirm request</button>
          </form>}
          {!['open','paid'].includes(booking.payment_state??'') && <button disabled={busy} onClick={() => void change('/bookings/'+booking.request_id+'/cancel','POST',undefined,()=>'Booking canceled.')}>Cancel booking</button>}
        </div>}
      </article>)}
    </section>}
    <div className="filters provider-filters">
      <label>Search services<input type="search" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label>Category<select value={category} onChange={event => setCategory(event.target.value)}>
        {['All categories', ...categories].map(item => <option key={item}>{item}</option>)}
      </select></label>
    </div>
    <div className="grid">{matches.map(item => <article className="panel" key={item.id}>
      <span className="eyebrow">{item.category}</span><h2>{item.title}</h2>
      <p>{item.display_name} · @{item.handle}</p><p className="post-text">{item.description}</p>
      <details><summary>Availability</summary>
        {item.owned && <form onSubmit={async event => {
          event.preventDefault();
          const form=event.currentTarget;
          const value=String(new FormData(form).get('start'));
          const start=new Date(value+'Z');
          if (!Number.isFinite(start.valueOf()) || start.valueOf()<=Date.now() || start.getUTCMinutes()!==0) {
            setMessage('Choose a future start on a whole UTC hour.');
            return;
          }
          if (await change('/listings/'+item.id+'/availability','POST',{start:start.toISOString()},()=>'Availability added.')) form.reset();
        }}>
          <label>One-hour start (UTC)<input type="datetime-local" name="start" step="3600" required/></label>
          <button disabled={busy}>Add time</button>
        </form>}
        {!item.availability.length && <p>No available times.</p>}
        {item.availability.map(slot => <p key={slot.id}>{new Date(slot.start).toLocaleString()} · 1 hour{' '}
          <button disabled={busy} onClick={() => void change('/slots/'+slot.id+(item.owned?'/remove':'/request'),'POST',undefined,()=>item.owned?'Time removed.':'Booking requested.')}>{item.owned?'Remove time':'Request time'}</button>
        </p>)}
      </details>
    </article>)}</div>
    <p role="status">{matches.length
      ? `${matches.length} service${matches.length === 1 ? '' : 's'} found.`
      : listings.length ? 'No services match your filters.' : 'No services have been published yet.'}</p>
  </section>;
}


type ConnectStatus = {enabled:boolean;eligible:boolean;connected:boolean;transfersEnabled?:boolean;payoutsEnabled?:boolean;url?:string};

function ProviderConnect({csrf}:{csrf:string}){
 const [status,setStatus]=useState<ConnectStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void get<ConnectStatus>('services/connect',controller.signal).then(setStatus).catch(()=>{
   if(!controller.signal.aborted)setMessage('Could not load Stripe sandbox status.');
  });
  return ()=>controller.abort();
 },[]);
 if(!status?.eligible)return message?<p role="status">{message}</p>:null;
 return <section className="panel">
  <h2>Stripe sandbox onboarding</h2>
  {status.connected && <p>Transfers {status.transfersEnabled?'enabled':'pending'} · Payouts {status.payoutsEnabled?'enabled':'pending'}</p>}
  <button disabled={busy} onClick={async()=>{
   setBusy(true);
   setMessage('');
   try{
    const response=await fetch('/api/v1/services/connect',{method:'POST',headers:{'X-CSRF-Token':csrf}});
    if(!response.ok)throw Error('Could not open Stripe sandbox onboarding.');
    const result:ConnectStatus=await response.json();
    if(!result.url)throw Error('Publish a provider listing before onboarding.');
    window.location.assign(result.url);
   }catch(error){setMessage((error as Error).message);}
   finally{setBusy(false);}
  }}>{busy?'Opening Stripe…':status.connected?'Continue Stripe onboarding':'Start Stripe onboarding'}</button>
  {message && <p role="status">{message}</p>}
 </section>;
}


function BookingCheckout({booking,csrf}:{booking:Booking;csrf:string}){
 const [message,setMessage]=useState('');
 const [url,setUrl]=useState('');
 const [busy,setBusy]=useState(false);
 const paymentState=booking.payment_state;
 return <>
  {paymentState==='paid'&&<p>Sandbox payment confirmed.</p>}
  {paymentState==='open'&&<p>Sandbox payment is open. Refresh bookings after paying.</p>}
  {paymentState==='expired'&&<p>Sandbox checkout expired. Cancel and request the slot again to get a new quote.</p>}
  {paymentState==='refunded'&&<p>Sandbox payment refunded.</p>}
  {!booking.provider && Date.parse(booking.starts_at)>Date.now() && (!paymentState||paymentState==='open') && <button disabled={busy} onClick={async()=>{
   setBusy(true);
   setMessage('Contacting Stripe…');
   setUrl('');
   try{
    const response=await fetch('/api/v1/services/bookings/'+booking.request_id+'/checkout',{method:'POST',headers:{'X-CSRF-Token':csrf}});
    const result=await response.json();
    if(!response.ok)throw Error(result.error?.message??'Checkout could not open.');
    setUrl(result.url);
    setMessage('Sandbox checkout is ready.');
    window.location.assign(result.url);
   }catch(error){setMessage((error as Error).message);}
   finally{setBusy(false);}
  }}>{paymentState==='open'?'Resume sandbox checkout':'Open sandbox checkout'}</button>}
  {message && <p role="status">{message}{url && <> <a href={url} target="_blank" rel="noopener noreferrer">Open Stripe in a new tab</a></>}</p>}
 </>;
}
