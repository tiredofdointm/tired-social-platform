import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
type Profile={id:string;handle:string;display_name:string;bio:string|null;visibility:string;follow_status?:string|null};
type Post={id:string;author_id:string;body:string;visibility:string;display_name:string;handle:string;created_at:string;likes:number;liked:boolean;follow_status:string|null};
const feedModes=[['for-you','For you'],['latest','Latest posts'],['following','Following accounts']] as const;
type Comment={id:string;body:string;display_name:string};
export function SharedSocial(){
 const [phase,setPhase]=useState('loading'),[me,setMe]=useState<Profile|null>(null),[csrf,setCsrf]=useState('');
 const [posts,setPosts]=useState<Post[]>([]),[cursor,setCursor]=useState<string|null>(null),[mode,setMode]=useState('for-you');
 const [requests,setRequests]=useState<Profile[]>([]),[blockedAccounts,setBlockedAccounts]=useState<Profile[]>([]),[lookup,setLookup]=useState(''),[found,setFound]=useState<Profile|null>(null);
 const [body,setBody]=useState(''),[visibility,setVisibility]=useState('public'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [comments,setComments]=useState<Record<string,Comment[]>>({}),[drafts,setDrafts]=useState<Record<string,string>>({});
 async function api(path:string,method='GET',data?:unknown){
  const response=await fetch('/api/v1/'+path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await response.json();
  if(response.status===401){setMe(null);setPosts([]);setComments({});setPhase('signed-out');throw new Error('Sign in to continue.');}
  if(!response.ok)throw new Error(value.error?.message??'Unable to save. Please retry.');return value;
 }
 async function feed(selected=mode,after:string|null=null){const value=await api(`feed?mode=${selected}${after?'&cursor='+encodeURIComponent(after):''}`);setPosts(previous=>after?[...previous,...value.posts]:value.posts);setCursor(value.nextCursor);}
 async function refresh(){await feed();setRequests((await api('me/follow-requests')).requests);setBlockedAccounts((await api('blocks')).accounts);}
 async function load(){
  setPhase('loading');setError('');
  try{
   const config=await fetch('/api/v1/auth/config',{cache:'no-store'});if(!config.ok)throw new Error('Account connection unavailable.');
   if((await config.json()).mode!=='google'){setPhase('preview');return;}
   const session=await api('me');setMe(session.user);setCsrf(session.csrfToken);await refresh();setPhase('ready');
  }catch(e){setError((e as Error).message);setPhase(previous=>previous==='signed-out'?previous:'error');}
 }
 useEffect(()=>{void load();const changed=()=>{setMe(null);setPosts([]);setComments({});void load();};window.addEventListener('tired-account-change',changed);return()=>window.removeEventListener('tired-account-change',changed);},[]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(event:FormEvent){event.preventDefault();await action(async()=>{await api('posts','POST',{body,visibility});setBody('');setNotice('Post published.');await feed();});}
 const follow=(profile:Profile)=>action(async()=>{const result=await api(`follows/${profile.id}`,profile.follow_status?'DELETE':'PUT');setFound({...profile,follow_status:result.follow.status});await refresh();});
 if(phase==='loading')return <section className="panel" role="status">Connecting to your community…</section>;
 if(phase==='preview')return <section className="panel"><h1>Shared community</h1><p>Shared accounts are not activated on this host yet. Explore the local preview while cloud setup is completed.</p><a href="#feed">Open preview feed</a></section>;
 if(phase==='signed-out')return <section className="panel"><h1>Join your community</h1><p>Sign in to use your shared profile and posts.</p><a className="primary" href="/auth/google">Sign in with Google</a></section>;
 if(phase==='error'||!me)return <section className="panel"><p role="alert">{error||'Account connection unavailable.'}</p><button onClick={()=>void load()}>Retry community connection</button></section>;
 return <section className="shared-community"><header className="page-heading"><h1>Your community</h1><p>Signed in as @{me.handle}. Posts here are saved to your account.</p></header>
 {error&&<p className="note" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <details className="panel"><summary>Edit shared profile</summary><form onSubmit={e=>{e.preventDefault();void action(async()=>{await api('me/profile','PATCH',{handle:me.handle,display_name:me.display_name,bio:me.bio??'',visibility:me.visibility});window.dispatchEvent(new Event('tired-profile-change'));setNotice('Profile saved.');});}}>
 <label>Account name<input required maxLength={80} value={me.display_name} onChange={e=>setMe({...me,display_name:e.target.value})}/></label>
 <label>Handle<input required pattern="[a-z0-9_]{3,30}" value={me.handle} onChange={e=>setMe({...me,handle:e.target.value})}/></label>
 <label>Account bio<textarea aria-label="Account bio" maxLength={500} value={me.bio??''} onChange={e=>setMe({...me,bio:e.target.value})}/></label>
 <label>Follow requests<select aria-label="Follow requests" value={me.visibility} onChange={e=>setMe({...me,visibility:e.target.value})}><option value="public">Accept automatically</option><option value="private">Require my approval</option></select></label>
 <p className="small muted">Post visibility is chosen separately. Public posts remain visible even when follows require approval.</p><button disabled={busy}>Save shared profile</button></form></details>
 {requests.length>0&&<section className="panel"><h2>Follow requests</h2>{requests.map(person=><div className="shared-person" key={person.id}><span>@{person.handle}</span><button disabled={busy} onClick={()=>void action(async()=>{await api(`follows/${person.id}/accept`,'PUT');await refresh();})}>Accept {person.display_name}</button><button disabled={busy} onClick={()=>void action(async()=>{await api(`follows/${person.id}/accept`,'DELETE');await refresh();})}>Decline {person.display_name}</button><button disabled={busy} onClick={()=>void action(async()=>{await api(`blocks/${person.id}`,'PUT');await refresh();})}>Block {person.display_name}</button></div>)}</section>}
 {blockedAccounts.length>0&&<details className="panel"><summary>Blocked accounts</summary>{blockedAccounts.map(person=><div className="shared-person" key={person.id}><span>@{person.handle}</span><button disabled={busy} onClick={()=>void action(async()=>{await api(`blocks/${person.id}`,'DELETE');await refresh();})}>Unblock {person.display_name}</button></div>)}</details>}
 <form className="panel" onSubmit={e=>{e.preventDefault();void action(async()=>setFound((await api('profiles/'+encodeURIComponent(lookup))).profile));}}><label>Find account by handle<input value={lookup} onChange={e=>{setLookup(e.target.value);setFound(null);}} pattern="[a-z0-9_]{3,30}" required/></label><button disabled={busy}>Find account</button>{found&&<div className="shared-person"><span>{found.display_name} · @{found.handle}{found.bio&&<p>{found.bio}</p>}</span>{found.id!==me.id&&<><button type="button" disabled={busy} onClick={()=>void follow(found)}>{found.follow_status==='pending'?'Cancel request':found.follow_status?'Unfollow':'Follow'}</button><button type="button" disabled={busy} onClick={()=>void action(async()=>{await api(`blocks/${found.id}`,'PUT');setFound(null);await refresh();})}>Block account</button></>}</div>}</form>
 <form className="panel" onSubmit={submit}><label>Shared post<textarea aria-label="Shared post" required maxLength={2000} value={body} onChange={e=>setBody(e.target.value)} placeholder="What’s happening?"/></label><div className="actions"><label>Who can see this<select aria-label="Who can see this" value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="public">Community</option><option value="followers">Accepted followers</option><option value="private">Only me</option></select></label><button className="primary" disabled={busy||!body.trim()}>Publish post</button></div></form>
 <div className="filters" aria-label="Shared feed mode">{feedModes.map(([value,label])=><button key={value} aria-pressed={mode===value} disabled={busy} onClick={()=>void action(async()=>{await feed(value);setMode(value);})}>{label}</button>)}<button disabled={busy} onClick={()=>void action(refresh)}>Refresh community</button></div>
 {mode==='for-you'&&<p className="small muted">Posts from accounts you follow get a 24-hour boost in this feed.</p>}
 {!posts.length&&<div className="panel"><h2>Your next conversation starts here.</h2><p>No posts to show in this feed. Share something or follow an account.</p></div>}
 <div className="stack">{posts.map(post=><article className="panel" key={post.id}><header><strong>{post.display_name}</strong> <span className="muted">@{post.handle} · {post.visibility}</span></header><p className="post-text">{post.body}</p><div className="actions"><button disabled={busy} aria-pressed={post.liked} onClick={()=>void action(async()=>{await api(`posts/${post.id}/reactions/like`,post.liked?'DELETE':'PUT');await feed();})}>{post.liked?'Unlike':'Like'} · {post.likes}</button><button disabled={busy} onClick={()=>void action(async()=>{setComments(previous=>({...previous,[post.id]:[]}));const result=await api(`posts/${post.id}/comments`);setComments(previous=>({...previous,[post.id]:result.comments}));})}>View comments</button>{post.author_id===me.id&&<button disabled={busy} onClick={()=>void action(async()=>{await api(`posts/${post.id}`,'DELETE');await feed();})}>Delete post</button>}</div>
 {comments[post.id]&&<section aria-label="Post comments"><p className="small muted">Most recent 50 comments</p>{comments[post.id].map(comment=><p key={comment.id}><strong>{comment.display_name}: </strong>{comment.body}</p>)}<form onSubmit={e=>{e.preventDefault();void action(async()=>{await api(`posts/${post.id}/comments`,'POST',{body:drafts[post.id]??''});setDrafts(previous=>({...previous,[post.id]:''}));const result=await api(`posts/${post.id}/comments`);setComments(previous=>({...previous,[post.id]:result.comments}));});}}><label>Shared comment<textarea aria-label="Shared comment" required maxLength={500} value={drafts[post.id]??''} onChange={e=>setDrafts(previous=>({...previous,[post.id]:e.target.value}))}/></label><button disabled={busy||!drafts[post.id]?.trim()}>Publish comment</button></form></section>}</article>)}</div>
 {cursor&&<button disabled={busy} onClick={()=>void action(()=>feed(mode,cursor))}>Load more posts</button>}
 </section>;
}
