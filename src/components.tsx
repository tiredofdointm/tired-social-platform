import {useEffect,useId,useRef,useState} from 'react';
import type {ReactNode,InputHTMLAttributes,FormEvent} from 'react';
export function Button({children,onClick,className='',disabled=false,label,pressed,description}:{children:ReactNode;onClick:()=>void;className?:string;disabled?:boolean;label?:string;pressed?:boolean;description?:string}){
 return <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed} aria-describedby={description}>{children}</button>;
}
export function Heading({title,sub,action}:{title:string;sub:string;action?:ReactNode}){
 return <div className="page-title"><div><span className="eyebrow">YOUR NEXT GOOD THING</span><h1>{title}</h1><p>{sub}</p></div>{action}</div>;
}
export function Empty({title,body}:{title:string;body:string}){return <div className="empty"><strong>{title}</strong><p>{body}</p></div>;}
type FieldProps=InputHTMLAttributes<HTMLInputElement>&{label:string;multiline?:boolean};
export function Field({label,multiline=false,...props}:FieldProps){
 const id=useId();
 return <div className="field"><label htmlFor={id}>{label}</label>{multiline?<textarea id={id} name={props.name} defaultValue={props.defaultValue} required={props.required} maxLength={props.maxLength}/>:<input {...props} id={id}/>}</div>;
}
export function Select({label,name,options,value}:{label:string;name:string;options:string[];value:string}){
 const id=useId();return <div className="field"><label htmlFor={id}>{label}</label><select id={id} name={name} defaultValue={value}>{options.map(o=><option key={o} value={o}>{o[0].toUpperCase()+o.slice(1)}</option>)}</select></div>;
}
export function Form({children,submit,onSubmit,className='',id}:{children:ReactNode;submit:string;onSubmit:(data:Record<string,string>,form:HTMLFormElement)=>void;className?:string;id?:string}){
 const [error,setError]=useState('');
 function handle(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const values:Record<string,string>={};new FormData(form).forEach((v,k)=>{values[k]=String(v);});try{onSubmit(values,form);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}}
 return <form id={id} className={className} onSubmit={handle}>{children}<p className="error" role="alert">{error}</p><button className="primary">{submit}</button></form>;
}
export function Dialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const el=ref.current!;el.showModal();return()=>{if(el.open)el.close();};},[]);
 return <dialog ref={ref} aria-labelledby={id} onCancel={onClose}><div className="modal-head"><h2 id={id}>{title}</h2><Button className="ghost" label="Close dialog" onClick={onClose}>✕</Button></div>{children}</dialog>;
}
export const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
export const cents=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export const initials=(s:string)=>s.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
export const date=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
