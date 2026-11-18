import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';

type Event = {id:string;title:string;venue:string;starts_at:string;capacity:number;attending:number;going:boolean;ticket_price_cents:number|null;held:number;my_hold_until:string|null;ticket_state:string|null};
type Plan = {id:string;title:string;details:string|null;starts_at:string|null;owner:boolean;accepted:boolean};

type Publishing={manual_review:boolean;admin:boolean;submissions:(Event&{publication:string})[]};

export function SharedEvents(){
 const [publishing,setPublishing]=useState<Publishing|null>(null);
 const [events,setEvents]=useState<Event[]>([]);
 const [checkoutEnabled,setCheckoutEnabled]=useState(false);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [token,setToken]=useState('');
 const [state,setState]=useState('loading');
 const [message,setMessage]=useState('');
 const [checkoutStatus,setCheckoutStatus]=useState<{id:string;text:string;url?:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [kind,setKind]=useState('events');

 async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api/v1/'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':token},
   body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401){setToken('');setEvents([]);setPlans([]);setState('signed-out');throw new Error('Sign in to continue.');}
  const data=await response.json();
  if(!response.ok)throw new Error(data.error?.message??'Unable to save changes.');
  return data;
 }
 async function refresh(){
  const [eventList,planList,policy]=await Promise.all([api<{events:Event[];checkoutEnabled:boolean}>('events'),api<{plans:Plan[]}>('plans'),api<Publishing>('events/publishing')]);
  setCheckoutEnabled(eventList.checkoutEnabled);
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
 if(state==='signed-out')return <section className="panel"><h1>Shared events and plans</h1><a href="/auth/google">Sign in with Google</a></section>;
 if(state==='error')return <section className="panel"><p role="alert">{message}</p><button onClick={()=>void load()}>Retry</button></section>;

 return <section className="shared-community">
  <h1>Shared events and plans</h1>
  <p role="status">{message}</p>
  <details className="panel"><summary>Create an event or plan</summary>
   <form onSubmit={create}>
    <label>Type<select aria-label="Type" value={kind} onChange={event=>setKind(event.target.value)}><option value="events">Community event</option><option value="plans">Private friend plan</option></select></label>
    <label>Title<input name="title" required maxLength={120}/></label>
    <label>Start time in your local timezone<input name="startsAt" type="datetime-local" required/></label>
    {kind==='events'?<>
     <label>Venue<input name="venue" required maxLength={160}/></label>
     <label>Test ticket price (USD, optional)<input name="price" type="number" step="0.01" min="0.50" max="999999.99"/></label>
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
  <h2>Upcoming events</h2>
  <div className="stack">{events.map(event=><article className="panel" key={event.id}>
   <h3 id={`event-title-${event.id}`}>{event.title}</h3><p>{event.venue} · {new Date(event.starts_at).toLocaleString()}</p>
   {event.ticket_price_cents!=null ? <>
    <p>Test ticket · ${(event.ticket_price_cents/100).toFixed(2)} · {event.capacity-event.held} available</p>
    {event.my_hold_until && <p>Held until {new Date(event.my_hold_until).toLocaleTimeString()}.</p>}
    {event.ticket_state==='issued' && <p>Your test ticket is confirmed.</p>}
    {event.ticket_state==='refunded' && <p>Your previous ticket was refunded.</p>}
    {checkoutEnabled && (event.my_hold_until || event.ticket_state==='open') && <button disabled={busy} onClick={async()=>{
     setBusy(true);
     setCheckoutStatus({id:event.id,text:'Contacting Stripe…'});
     try{
      const {url}=await api<{url:string}>('events/'+event.id+'/checkout','POST');
      setCheckoutStatus({id:event.id,text:'Test checkout is ready.',url});
      window.location.assign(url);
     }catch(error){
      setCheckoutStatus({id:event.id,text:'Checkout could not open: '+(error as Error).message});
     }finally{setBusy(false);}
    }}>{event.ticket_state==='open'?'Resume test checkout':'Open test checkout'}</button>}
    {checkoutStatus?.id===event.id && <p role="status">{checkoutStatus.text}{checkoutStatus.url && <> <a href={checkoutStatus.url} target="_blank" rel="noopener noreferrer">Open Stripe in a new tab</a></>}</p>}
    {event.ticket_state!=='issued' && event.ticket_state!=='open' && <button aria-describedby={`event-title-${event.id}`} disabled={busy} onClick={()=>void action(
     ()=>api('events/'+event.id+'/ticket-hold',event.my_hold_until?'DELETE':'PUT'),
     event.my_hold_until?'Hold released.':'Test ticket held.'
    )}>{event.my_hold_until?'Release hold':'Hold one test ticket'}</button>}
   </> : <><p>{event.attending} / {event.capacity} attending</p>
   <button aria-describedby={`event-title-${event.id}`} disabled={busy||(!event.going&&event.attending>=event.capacity)} onClick={()=>void action(
    ()=>api('events/'+event.id+'/rsvp',event.going?'DELETE':'PUT'),event.going?'RSVP canceled.':'RSVP saved.'
   )}>{event.going?'Cancel RSVP':event.attending>=event.capacity?'Event full':'RSVP'}</button></>}
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
