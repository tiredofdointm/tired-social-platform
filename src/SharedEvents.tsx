import type {CreateRequest} from './SharedCreate';
import {downloadEventCalendar} from './eventCalendar';
import {rememberEventForSignIn,sharedEventUrl} from './sharedEventLink';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';

type Event = {id:string;title:string;venue:string;starts_at:string;capacity:number;attending:number;attending_friends?:string[];going:boolean;ticket_price_cents:number|null;ticketQuote?:{ticketCents:number;feeCents:number;totalCents:number};held:number;my_hold_until:string|null;ticket_state:string|null;owner:boolean;check_in_staff:boolean;upcoming:boolean;my_ticket_code:string|null;my_checked_in_at:string|null};
type Plan = {id:string;title:string;details:string|null;starts_at:string|null;owner:boolean;accepted:boolean};

type Publishing={manual_review:boolean;admin:boolean;submissions:(Event&{publication:string})[]};

export function SharedEvents({linkedId,create:request}:{linkedId:string|null;create:CreateRequest}){
 const linkedHeading=useRef<HTMLHeadingElement>(null);
 const [publishing,setPublishing]=useState<Publishing|null>(null);
 const [events,setEvents]=useState<Event[]>([]);
 const [checkoutEnabled,setCheckoutEnabled]=useState(false);
 const [liveTickets,setLiveTickets]=useState(false);
 const [seller,setSeller]=useState<{transfersEnabled?:boolean;payoutsEnabled?:boolean}|null>(null);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [token,setToken]=useState('');
 const [state,setState]=useState('loading');
 const [message,setMessage]=useState('');
 const [checkoutStatus,setCheckoutStatus]=useState<{id:string;text:string;url?:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [kind,setKind]=useState('events');

 const titleInput=useRef<HTMLInputElement>(null);
 useLayoutEffect(()=>{
  if(state!=='ready'||(request.target!=='event'&&request.target!=='plan'))return;
  setKind(request.target==='event'?'events':'plans');
  const details=titleInput.current?.closest('details');
  if(details)details.open=true;
  titleInput.current?.focus();
  request.handled();
 },[state,request.target,request.handled]);
 async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api/v1/'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':token},
   body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401){setToken('');setEvents([]);setPlans([]);setState('signed-out');throw new Error('Sign in to continue.');}
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message??'Unable to save changes.');
  return data;
 }
 async function refresh(){
  const [eventList,planList,policy]=await Promise.all([api<{events:Event[];checkoutEnabled:boolean;liveTickets?:boolean}>('events'+(linkedId?'?event='+linkedId:'')),api<{plans:Plan[]}>('plans'),api<Publishing>('events/publishing')]);
  setCheckoutEnabled(eventList.checkoutEnabled);
  setLiveTickets(eventList.liveTickets===true);
  if(eventList.liveTickets){
   try{setSeller(await api('events/connect'));}catch{setSeller(null);}
  }
  setEvents(eventList.events);
  setPlans(planList.plans);
  setPublishing(policy);
 }
 async function load(){
  setState('loading');
  try{
   const config=await api<{mode:string}>('auth/config');
   if(config.mode==='preview'){setState('preview');return;}
   const session=await api<{csrfToken:string}>('me');
   await refresh();
   setToken(session.csrfToken);
   setState('ready');
  }catch(error){setMessage((error as Error).message);setState(value=>value==='signed-out'?value:'error');}
 }
 useEffect(()=>{
  void load();
  const signedOut=()=>{setToken('');setEvents([]);setPlans([]);setState('signed-out');};
  window.addEventListener('tired-account-change',signedOut);
  return ()=>window.removeEventListener('tired-account-change',signedOut);
 },[]);
 useEffect(()=>{
  if(state==='ready')linkedHeading.current?.focus();
 },[state]);
 async function shareEvent(id:string){
  const url=sharedEventUrl(id).href;
  try{await navigator.clipboard.writeText(url);setMessage('Event link copied.');}
  catch{setMessage('Copy this event link manually: '+url);}
 }
 async function action(work:()=>Promise<unknown>,success:string){
  setBusy(true);setMessage('');
  try{const result=await work();await refresh();setMessage(typeof result==='string'?result:success);}
  catch(error){setMessage((error as Error).message);}
  finally{setBusy(false);}
 }
 function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=event.currentTarget;
  const values=new FormData(form);
  void action(async()=>{
   const startsAt=new Date(String(values.get('startsAt'))).toISOString();
   const title=values.get('title');
   const body=kind==='events'?{title,startsAt,venue:values.get('venue'),capacity:Number(values.get('capacity')),ticketPriceCents:values.get('price')?Math.round(Number(values.get('price'))*100):null}
    :{title,startsAt,details:values.get('details')};
   return api<{publication?:string}>(kind,'POST',body).then(result=>{
    form.reset();
    return result.publication==='pending'?'Submitted for review.':undefined;
   });
  },kind==='events'?'Event published.':'Private plan created.');
 }
 if(state==='loading')return <p role="status">Loading events and plans…</p>;
 if(state==='preview')return <section className="panel"><h1>Shared events and plans</h1><p>Shared access is pending cloud setup.</p><a href="#discover">Explore the event preview</a></section>;
 if(state==='signed-out')return <section className="panel"><h1>Shared events and plans</h1><a href="/auth/google?next=shared-events" onClick={rememberEventForSignIn}>Sign in with Google</a></section>;
 if(state==='error')return <section className="panel"><p role="alert">{message}</p><button onClick={()=>void load()}>Retry</button></section>;

 return <section className="shared-community">
  <h1>Shared events and plans</h1>
  <p className="post-text" role="status">{message}</p>
  {liveTickets&&<details className="panel"><summary>Organizer payouts</summary>
   <p>{seller?.transfersEnabled&&seller.payoutsEnabled?'Your Stripe account can receive ticket sales.':seller?'Connect a payout account to sell tickets. Free events are available now.':'Payout account status is unavailable. Refresh the list to check again.'}</p>
   <button disabled={busy} onClick={()=>void action(async()=>{
    const {url}=await api<{url:string}>('events/connect','POST');
    window.location.assign(url);
   },'')}>Manage organizer payouts</button>
  </details>}
  <details className="panel"><summary>Create an event or plan</summary>
   <form onSubmit={create}>
    <label>Type<select aria-label="Type" value={kind} onChange={event=>setKind(event.target.value)}><option value="events">Community event</option><option value="plans">Private friend plan</option></select></label>
    <label>Title<input ref={titleInput} name="title" required maxLength={120}/></label>
    <label>Start time in your local timezone<input name="startsAt" type="datetime-local" required/></label>
    {kind==='events'?<>
     <label>Venue<input name="venue" required maxLength={160}/></label>
     {checkoutEnabled && (!liveTickets || (seller?.payoutsEnabled && seller.transfersEnabled)) && <label>{liveTickets?'Ticket price':'Test ticket price'} (USD, optional)<input name="price" type="number" step="0.01" min="0.50" max="999999.99"/></label>}
     <label>Capacity<input name="capacity" required type="number" min={1} max={10000} defaultValue={20}/></label>
    </>:<label>Meetup details<textarea name="details" required maxLength={1000}/></label>}
    <button className="primary" disabled={busy}>{kind==='events'?(publishing?.manual_review?'Submit event for review':'Publish event'):'Create private plan'}</button>
   </form>
  </details>
  <button disabled={busy} onClick={()=>void action(async()=>{},'Lists refreshed.')}>Refresh lists</button>
  {publishing?.admin&&<section className="panel">
   <h2>Event publishing</h2>
   <p>{publishing.manual_review?'New events require approval.':'New events publish automatically.'}</p>
   <button disabled={busy} onClick={()=>void action(
    ()=>api('events/publishing','PUT',{manualReview:!publishing.manual_review}),'Publishing policy saved.'
   )}>{publishing.manual_review?'Enable automatic publishing':'Require manual review'}</button>
  </section>}
  {!!publishing?.submissions.length&&<section className="panel">
   <h2>Event submissions</h2>
   {publishing.submissions.map(event=><article key={event.id}>
    <h3>{event.title}</h3><p>{event.venue} · {new Date(event.starts_at).toLocaleString()} · {event.publication}</p>
    {publishing.admin&&event.publication==='pending'&&<div className="actions">
     {(['published','rejected'] as const).map(decision=><button key={decision} disabled={busy} onClick={()=>void action(
      ()=>api('events/'+event.id+'/review','PUT',{decision}),decision==='published'?'Event approved.':'Event rejected.'
     )}>{decision==='published'?'Approve':'Reject'}</button>)}
    </div>}
   </article>)}
  </section>}
  <h2>{events.some(event=>!event.upcoming)?'Events and active tickets':'Upcoming events'}</h2>
  {linkedId&&!events.some(event=>event.id===linkedId)&&<p role="status">This event is unavailable. Browse upcoming events below.</p>}
  <div className="stack">{events.map(event=><article className="panel" key={event.id}>
   <h3 id={`event-title-${event.id}`} ref={event.id===linkedId?linkedHeading:undefined} tabIndex={event.id===linkedId?-1:undefined}>{event.title}</h3><p>{event.venue} · {new Date(event.starts_at).toLocaleString()}</p>
   {event.attending_friends&&event.attending_friends.length>0&&<p>Friends going: {event.attending_friends.slice(0,20).map(handle=>'@'+handle).join(', ')}{event.attending_friends.length>20?' and more':''}</p>}
   {event.ticket_price_cents!=null ? <>
    <p>{liveTickets?'Ticket':'Test ticket'} · ${(event.ticket_price_cents/100).toFixed(2)}{liveTickets&&event.ticketQuote&&<> + ${(event.ticketQuote.feeCents/100).toFixed(2)} platform fee (7.5%) · ${(event.ticketQuote.totalCents/100).toFixed(2)} total</>} · {event.capacity-event.held} available</p>
    {event.my_hold_until && <p>Held until {new Date(event.my_hold_until).toLocaleTimeString()}.</p>}
    {event.ticket_state==='issued' && <><p>Your {liveTickets?'ticket':'test ticket'} is confirmed.</p>
     {event.my_checked_in_at?<p>Checked in at {new Date(event.my_checked_in_at).toLocaleTimeString()}.</p>:<p>Check-in code <code className="post-text">{event.my_ticket_code}</code></p>}
    </>}
    {(event.owner||event.check_in_staff) && <OrganizerTickets eventId={event.id} api={api} live={liveTickets} owner={event.owner}/>}
    {event.ticket_state==='refunded' && <p>Your previous ticket was refunded.</p>}
    {checkoutEnabled && event.upcoming && (event.my_hold_until || event.ticket_state==='open') && <button disabled={busy} onClick={async()=>{
     setBusy(true);
     setCheckoutStatus({id:event.id,text:'Contacting Stripe…'});
     try{
      const {url}=await api<{url:string}>('events/'+event.id+'/checkout','POST');
      setCheckoutStatus({id:event.id,text:liveTickets?'Checkout is ready.':'Test checkout is ready.',url});
      window.location.assign(url);
     }catch(error){
      setCheckoutStatus({id:event.id,text:'Checkout could not open: '+(error as Error).message});
     }finally{setBusy(false);}
    }}>{event.ticket_state==='open'?(liveTickets?'Resume checkout':'Resume test checkout'):(liveTickets?'Open checkout':'Open test checkout')}</button>}
    {checkoutStatus?.id===event.id && <p role="status">{checkoutStatus.text}{checkoutStatus.url && <> <a href={checkoutStatus.url} target="_blank" rel="noopener noreferrer">Open Stripe in a new tab</a></>}</p>}
    {event.upcoming && event.ticket_state!=='issued' && event.ticket_state!=='open' && <button aria-describedby={`event-title-${event.id}`} disabled={busy} onClick={()=>void action(
     ()=>api('events/'+event.id+'/ticket-hold',event.my_hold_until?'DELETE':'PUT'),
     event.my_hold_until?'Hold released.':liveTickets?'Ticket held.':'Test ticket held.'
    )}>{event.my_hold_until?'Release hold':liveTickets?'Hold one ticket':'Hold one test ticket'}</button>}
   </> : <><p>{event.attending} / {event.capacity} attending</p>
   <button aria-describedby={`event-title-${event.id}`} disabled={busy||(!event.going&&event.attending>=event.capacity)} onClick={()=>void action(
    ()=>api('events/'+event.id+'/rsvp',event.going?'DELETE':'PUT'),event.going?'RSVP canceled.':'RSVP saved.'
   )}>{event.going?'Cancel RSVP':event.attending>=event.capacity?'Event full':'RSVP'}</button></>}
   {event.upcoming&&<div className="actions"><button type="button" className="ghost" aria-describedby={`event-title-${event.id}`} onClick={()=>void shareEvent(event.id)}>Copy event link</button>
    <button type="button" className="ghost" aria-describedby={"event-title-"+event.id} onClick={()=>downloadEventCalendar(event,sharedEventUrl(event.id))}>Add to calendar</button>
   </div>}
  </article>)}</div>
  {!events.length&&<p>No upcoming events.</p>}
  <h2>Private friend plans</h2>
  <div className="stack">{plans.map(plan=><article className="panel" key={plan.id}>
   <h3 id={`plan-title-${plan.id}`}>{plan.title}</h3>
   {plan.details&&<p className="post-text">{plan.details}</p>}
   {plan.starts_at&&<p>{new Date(plan.starts_at).toLocaleString()}</p>}
   {plan.owner?<form onSubmit={event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const handle=new FormData(form).get('handle');
    void action(async()=>{await api('plans/'+plan.id+'/invite','PUT',{handle});form.reset();},'In-app invitation saved.');
   }}><label>Invite by handle<input name="handle" required pattern="[a-z0-9_]{3,30}"/></label><button disabled={busy}>Invite</button></form>
   :<div className="actions">
     {!plan.accepted&&<button aria-describedby={`plan-title-${plan.id}`} disabled={busy} onClick={()=>void action(()=>api('plans/'+plan.id+'/membership','PUT'),'Invitation accepted.')}>Accept invitation</button>}
     <button aria-describedby={`plan-title-${plan.id}`} disabled={busy} onClick={()=>void action(()=>api('plans/'+plan.id+'/membership','DELETE'),'Membership removed.')}>{plan.accepted?'Leave plan':'Decline invitation'}</button>
    </div>}
  </article>)}</div>
  {!plans.length&&<p>No plans or invitations.</p>}
 </section>;
}


type GuestList = {
 guests:{display_name:string;handle:string;order_id:string;refundable:boolean;checked_in_at:string|null}[];
 totals:{issued:number;checked_in:number;net_cents:string};
};

function OrganizerTickets({eventId,api,live,owner}:{eventId:string;live:boolean;owner:boolean;api:<T>(path:string,method?:string,body?:unknown)=>Promise<T>}){
 const [list,setList]=useState<GuestList|null>(null);
 const [staff,setStaff]=useState<{user_id:string;handle:string}[]|null>(null);
 async function loadStaff(){
  const response=await api<{staff:{user_id:string;handle:string}[]}>(path+'/staff');
  setStaff(response.staff);
 }
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const path='events/'+eventId;
 async function run(work:()=>Promise<void>){
  setBusy(true);
  setMessage('');
  try{await work();}catch(error){setMessage((error as Error).message);}
  finally{setBusy(false);}
 }
 async function loadGuests(){
  setList(await api<GuestList>(path+'/guest-list'));
 }
 return <details className="panel">
  <summary>{owner?'Guest list and check-in':'Staff check-in'}</summary>
  {owner&&<details><summary>Manage check-in staff</summary>
   <p>Staff can check tickets at this event. Only the organizer can view the guest list or issue refunds.</p>
   <form onSubmit={event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const handle=String(new FormData(form).get('handle')).trim().replace(/^@/,'').toLowerCase();
    void run(async()=>{await api(path+'/staff','PUT',{handle});form.reset();await loadStaff();setMessage('Staff access granted.');});
   }}>
    <label>Staff account handle<input name="handle" required maxLength={31}/></label>
    <button disabled={busy}>Grant check-in access</button>
   </form>
   <button disabled={busy} onClick={()=>void run(loadStaff)}>View assigned staff</button>
   {staff&&(staff.length?<ul>{staff.map(person=><li key={person.user_id}>@{person.handle} <button disabled={busy}
    onClick={()=>void run(async()=>{await api(path+'/staff','DELETE',{userId:person.user_id});await loadStaff();setMessage('Staff access removed.');})}
    aria-label={'Remove check-in access for @'+person.handle}>Remove access</button></li>)}</ul>:<p>No staff assigned.</p>)}
  </details>}
  {owner&&<button type="button" disabled={busy} onClick={()=>void run(loadGuests)}>{list?'Refresh guest list':'Load guest list'}</button>}
  <form onSubmit={event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const code=String(new FormData(form).get('code')).trim();
   void run(async()=>{
    await api(path+'/check-in','POST',{code});
    form.reset();
    setMessage('Guest checked in.');
    if(owner)await loadGuests();
   });
  }}>
   <label>Guest ticket code<input name="code" required maxLength={36} autoComplete="off"/></label>
   <button disabled={busy}>Check in guest</button>
  </form>
  <p className="post-text" role="status">{message}</p>
  {list && <>
   <p>{list.totals.checked_in} of {list.totals.issued} guests checked in · ${(Number(list.totals.net_cents)/100).toFixed(2)} {live?'in buyer payments after refunds':'net test sales'}</p>
   {list.guests.length?<ul>{list.guests.map(guest=><li key={guest.order_id}>
    {guest.display_name} (@{guest.handle}) · {guest.checked_in_at?'Checked in':'Awaiting check-in'}
    {guest.refundable && <button type="button" disabled={busy} onClick={()=>{
     if(!window.confirm((live?'Refund the remaining payment for ':'Refund the remaining test payment for ')+guest.display_name+'?'))return;
     void run(async()=>{
      const result=await api<{status:string}>(path+'/refund','POST',{orderId:guest.order_id});
      setMessage(result.status==='refunded'?'Ticket already refunded.':'Refund submitted. Refresh the guest list to check for Stripe confirmation.');
      await loadGuests();
     });
    }}>{live?'Refund ticket':'Refund test ticket'}</button>}
   </li>)}</ul>:<p>No confirmed guests yet.</p>}
  </>}
 </details>;
}
