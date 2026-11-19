import {useRef} from 'react';

const actions=[
 ['post','Community post'],
 ['event','Community event'],
 ['plan','Private friend plan'],
 ['service','Service listing'],
] as const;

export type CreateTarget=typeof actions[number][0];
export type CreateRequest={target:CreateTarget|null;handled:()=>void};

export function SharedCreate({choose}:{choose:(target:CreateTarget)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 return <>
  <button className="primary" aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()}>+ Create</button>
  <dialog ref={dialog} aria-labelledby="shared-create-title">
   <header className="modal-head"><h2 id="shared-create-title">Create</h2>
    <button aria-label="Close Create" onClick={()=>dialog.current?.close()}>Close</button></header>
   <div className="stack">{actions.map(([kind,label])=><button key={kind} onClick={()=>{
    dialog.current?.close();
    choose(kind);
   }}>{label}</button>)}</div>
  </dialog>
 </>;
}
