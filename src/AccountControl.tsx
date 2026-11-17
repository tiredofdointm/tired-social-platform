import {useEffect,useState} from 'react';
type Account={user:{display_name:string},csrfToken:string};
export function AccountControl(){
 const [mode,setMode]=useState('loading'),[account,setAccount]=useState<Account|null>(null),[busy,setBusy]=useState(false);
 async function load(){
  try {
   const config=await fetch('/api/v1/auth/config',{cache:'no-store'});
   if(!config.ok) throw new Error();
   const value=await config.json();
   if(value.mode==='preview'){setMode('preview');return;}
   if(value.mode!=='google') throw new Error();
   const response=await fetch('/api/v1/me',{cache:'no-store'});
   if(response.status===401) setAccount(null);
   else if(response.ok) setAccount(await response.json());
   else throw new Error();
   setMode('google');
  }catch{setMode('error');}
 }
 useEffect(()=>{void load();const reload=()=>void load();window.addEventListener('tired-profile-change',reload);return()=>window.removeEventListener('tired-profile-change',reload);},[]);
 async function logout(){
  if(!account)return;
  setBusy(true);
  try{const response=await fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':account.csrfToken}});
   if(!response.ok)throw new Error();setAccount(null);window.dispatchEvent(new Event('tired-account-change'));
  }catch{setMode('error');}finally{setBusy(false);}
 }
 if(mode==='preview'||mode==='loading')return null;
 if(mode==='error')return <button onClick={()=>void load()}>Retry account connection</button>;
 if(!account)return <a className="primary" href="/auth/google">Sign in with Google</a>;
 return <div className="account-control"><span>Signed in: {account.user.display_name}</span><button disabled={busy} onClick={()=>void logout()}>{busy?'Signing out…':'Sign out'}</button></div>;
}
