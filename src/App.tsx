import {SharedServices} from './SharedServices';
import {SharedEvents} from './SharedEvents';
import {SharedSocial} from './SharedSocial';
import {AccountControl} from './AccountControl';
import {useEffect,useRef,useState} from 'react';
import {useWorkspace} from './workspace';
import {WorkspaceContext} from './context';
import {Discover,Feed,Plans,TalentPage,Studio,Settings} from './pages';
import {Modal} from './dialogs';
import {initials} from './components';
import {makeSeed} from './model';
import type {Page,ModalState,Update} from './types';
const navs:[Page,string,string][]=[['discover','◈','Discover'],['feed','≋','Your feed'],['community','◎','Shared community'],['plans','◷','Friend plans'],['shared-events','◇','Shared events'],['talent','✧','Find talent'],['studio','▦','Organizer studio'],['settings','⚙','Customize']];
function hashPage():Page{return navs.find(n=>n[0]===location.hash.slice(1))?.[0]||'discover';}
export function App(){
 const {state,setState,storageOK}=useWorkspace(),[page,setPage]=useState<Page>(hashPage),[query,setQuery]=useState(''),[modal,setModal]=useState<ModalState|null>(null),[toast,setToast]=useState(''),[talentPreview,setTalentPreview]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false),menuButton=useRef<HTMLButtonElement>(null),modalOpener=useRef<HTMLElement>(null);
 useEffect(()=>{const change=()=>{setPage(hashPage());setQuery('');setMenuOpen(false);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 useEffect(()=>{
  const {theme,accent,density,motion}=state.prefs;
  const dark=matchMedia('(prefers-color-scheme: dark)');
  function applyAppearance(){
   Object.assign(document.body.dataset,{
    theme:theme==='system'?(dark.matches?'dark':'light'):theme,
    accent,density,motion:motion?'on':'off'
   });
  }
  applyAppearance();
  if(theme==='system'){
   dark.addEventListener('change',applyAppearance);
   return ()=>dark.removeEventListener('change',applyAppearance);
  }
 },[state.prefs]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(timer);},[toast]);
 function go(p:Page){
  const previousFocus=document.activeElement;
  setMenuOpen(false);setPage(p);setQuery('');location.hash=p;
  requestAnimationFrame(()=>{
   if(document.activeElement===previousFocus||document.activeElement===document.body)
    document.getElementById('main')?.focus();
  });
 }
 function openModal(next:ModalState){
  if(!modal&&document.activeElement instanceof HTMLElement)modalOpener.current=document.activeElement;
  setModal(next);
 }
 function closeModal(){
  const opener=modalOpener.current;
  modalOpener.current=null;
  setModal(null);
  requestAnimationFrame(()=>{
   if(document.activeElement===document.body)(opener?.isConnected?opener:document.getElementById('main'))?.focus();
  });
 }
 const update:Update=(change,message)=>{setState(previous=>{const next=structuredClone(previous);change(next);return next;});if(message)setToast(message);};
 const shared=page==='community'||page==='shared-events'||(page==='talent'&&!talentPreview);
 const searchable=!shared&&page!=='studio'&&page!=='settings';
 const content={'shared-events':<SharedEvents/>,community:<SharedSocial/>,discover:<Discover/>,feed:<Feed/>,plans:<Plans/>,talent:<SharedServices preview={<TalentPage/>} onPreviewMode={setTalentPreview}/>,studio:<Studio/>,settings:<Settings/>}[page];
 return <WorkspaceContext.Provider value={{state,update,go,query,open:openModal,notify:setToast}}><div className="layout"><aside className="sidebar" onKeyDown={event=>{
  if(event.key==='Escape'&&menuOpen){event.preventDefault();setMenuOpen(false);menuButton.current?.focus();}
 }}><div className="sidebar-heading"><a className="logo" href="#discover">tired<span>®</span></a>
 <button type="button" className="nav-toggle" ref={menuButton} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={()=>setMenuOpen(value=>!value)}>
  <span>Pages</span><span className="nav-current">{navs.find(item=>item[0]===page)?.[2]}</span>
 </button></div><p className="brand-caption">GO OUT. GET CONNECTED.</p><nav id="main-navigation" className={menuOpen?"nav nav-open":"nav"} aria-label="Main navigation">{navs.map(([p,i,n])=><button key={p} className={page===p?'selected':''} aria-current={page===p?'page':undefined} onClick={()=>go(p)}><span className="nav-icon" aria-hidden="true">{i}</span>{n}</button>)}</nav><div className="sidebar-bottom"><div className="user"><span className="avatar">{initials(state.profile.name)}</span><div><strong>{state.profile.name}</strong><br/><small>Personal workspace</small></div></div></div></aside><div className="main-wrap"><header className="topbar">{shared?<span className="small muted">Shared workspace</span>:searchable?<input className="search" id="search" type="search" aria-label="Search current page" placeholder="Search events, people, possibilities…" value={query} onChange={e=>setQuery(e.target.value)}/>:null}<div className="top-actions"><AccountControl page={page}/>{!shared&&<><span className="location small muted">Los Angeles, CA ↗</span><button className="primary" onClick={()=>openModal({kind:'create'})}>+ Create</button></>}</div></header><div className="demo-banner">{shared?'SHARED WORKSPACE · Google sign-in required':'INTERACTIVE PREVIEW · Sample community and listings · Your changes stay in this browser · No live payments'}{!storageOK?' · Storage unavailable':''}</div><main id="main" tabIndex={-1}>{content}</main></div></div>{modal&&<Modal key={modal.kind+modal.id} modal={modal} onClose={closeModal} onReset={()=>setState(makeSeed())}/>}<div id="toast" role="status" aria-live="polite" className={toast?'show':''}>{toast}</div></WorkspaceContext.Provider>;
}
