import {useEffect,useState} from 'react';
import {makeSeed,STORAGE_KEY} from './model';
import type {State} from './types';
function isRecord(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v);}
function validShape(v:unknown, sample:unknown):boolean{
 if(Array.isArray(sample))return Array.isArray(v)&&(sample.length===0?v.every(x=>typeof x==='string'):v.every(x=>validShape(x,sample[0])));
 if(isRecord(sample))return isRecord(v)&&Object.entries(sample).every(([k,value])=>validShape(v[k],value));
 return typeof v===typeof sample && (typeof v!=='number'||Number.isFinite(v));
}
export function restoreState(raw:string|null):State{
 if(!raw)return makeSeed();
 try{
 const v:unknown=JSON.parse(raw),seed=makeSeed();
 if(!isRecord(v)||v.version!==1)return seed;
 const example:State={...seed,plans:[{id:'',title:'',date:'',time:'',friends:'',notes:''}],bookings:[{id:'',name:'',date:'',hours:1,subtotal:0,fee:0,total:0}]};
 if(!validShape(v,example))return seed;
 const prefs=v.prefs as Record<string,unknown>;
 if(!['dark','light','system'].includes(String(prefs.theme))||!['lime','violet','peach'].includes(String(prefs.accent))||!['comfortable','compact'].includes(String(prefs.density)))return seed;
 return v as unknown as State;
 }catch{return makeSeed();}
}
export function useWorkspace(){
 const [state,setState]=useState<State>(()=>{try{return restoreState(localStorage.getItem(STORAGE_KEY));}catch{return makeSeed();}});
 const [storageOK,setStorageOK]=useState(true);
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));setStorageOK(true);}catch{setStorageOK(false);}},[state]);
 return {state,setState,storageOK};
}
