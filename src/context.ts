
import {createContext,useContext} from 'react';
import type {State,Update,Page,ModalState} from './types';
export interface Workspace {state:State;update:Update;go:(page:Page)=>void;open:(modal:ModalState)=>void;query:string;notify:(message:string)=>void}
export const WorkspaceContext=createContext<Workspace|null>(null);
export function useApp(){const value=useContext(WorkspaceContext);if(!value)throw Error('Workspace unavailable');return value;}
