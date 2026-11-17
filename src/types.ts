export type Page = 'community'|'discover'|'feed'|'plans'|'talent'|'studio'|'settings';
export type FeedMode = 'for-you'|'following'|'latest';
export interface Preferences {theme:'dark'|'light';accent:'lime'|'violet'|'peach';density:'comfortable'|'compact';motion:boolean;review:boolean}
export interface EventListing {id:string;title:string;subtitle:string;category:string;location:string;date:string;price:number;capacity:number;going:number;friends:string[];style:string;owner:string;status:'published'|'pending'}
export interface Post {id:string;author:string;handle:string;text:string;eventId:string;likes:number;liked:boolean;comments:{author:string;text:string}[];createdAt:number}
export interface Talent {id:string;name:string;role:string;tag:string;rate:number;style:string;bio:string;owner:string}
export interface Plan {id:string;title:string;date:string;time:string;friends:string;notes:string}
export interface Quote {subtotal:number;fee:number;total:number}
export interface Booking extends Quote {id:string;name:string;date:string;hours:number}
export interface State {version:1;prefs:Preferences;profile:{name:string;bio:string};following:string[];saved:string[];attending:string[];bookings:Booking[];plans:Plan[];events:EventListing[];posts:Post[];talent:Talent[]}
export type Update = (change:(draft:State)=>void,message?:string)=>void;
export type ModalState = {kind:'create'|'event'|'new-event'|'plan'|'service'|'booking'|'comments'|'delete-plan'|'reset';id?:string};
