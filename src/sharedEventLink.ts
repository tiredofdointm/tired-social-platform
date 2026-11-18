const eventHash = /^#shared-events\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const signInKey = 'tired-shared-event-after-sign-in';

export function sharedEventUrl(id: string) {
 return new URL('/#shared-events/'+id,location.origin);
}

export function linkedEventId(hash: string) {
 return eventHash.exec(hash)?.[1].toLowerCase() ?? null;
}

export function rememberEventForSignIn() {
 const id=linkedEventId(location.hash);
 if(!id)return;
 try{sessionStorage.setItem(signInKey,JSON.stringify({hash:location.hash,expires:Date.now()+600000}));}catch{}
}

export function sharedEventAfterSignIn() {
 try{
  const saved=sessionStorage.getItem(signInKey);
  sessionStorage.removeItem(signInKey);
  if(!saved||location.hash!=='#shared-events')return null;
  const {hash,expires}=JSON.parse(saved);
  return typeof hash==='string'&&linkedEventId(hash)&&expires>Date.now()?hash:null;
 }catch{return null;}
}
