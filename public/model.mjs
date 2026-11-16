export const STORAGE_KEY = 'tired-social-v1';
export function rankPosts(posts, following, mode='for-you') {
 const list = mode === 'following' ? posts.filter(p => following.includes(p.author) || p.author === 'You') : [...posts];
 return list.sort((a,b) => mode === 'latest' || mode === 'following'
  ? b.createdAt-a.createdAt
  : (score(b,following)-score(a,following)));
}
function score(p, following) {return p.createdAt / 3600000 + Math.min(p.likes,50)*0.2 + (following.includes(p.author)?8:0);}
export function toggleItem(items, id) {return items.includes(id) ? items.filter(x=>x!==id) : [...items,id];}
export function calculateQuote(rate,hours,feePercent=10) {
 if (!Number.isFinite(rate) || rate < 0 || !Number.isInteger(hours) || hours < 1 || hours > 12 || !Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) throw new Error('Invalid quote');
 const subtotal=Math.round(rate*100)*hours, fee=Math.round(subtotal*feePercent/100);
 return {subtotal,fee,total:subtotal+fee};
}
export function validateEvent(e) {
 if (!e.title?.trim() || e.title.trim().length>100) return 'Enter an event name of 1–100 characters.';
 if (!e.location?.trim()) return 'Enter a location.';
 if (!e.date || !Number.isFinite(Date.parse(e.date))) return 'Choose a valid date.';
 if (!Number.isFinite(e.price) || e.price < 0 || e.price > 10000) return 'Price must be between $0 and $10,000.';
 if (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > 100000) return 'Capacity must be a whole number between 1 and 100,000.';
 return null;
}
export function makeSeed(now=Date.now()) {
 const day=n=>new Date(now+n*86400000).toISOString().slice(0,10);
 return {
 version:1, prefs:{theme:'dark',accent:'lime',density:'comfortable',motion:true,review:false},
 profile:{name:'You',bio:'Here for good people and unforgettable nights.'},
 following:[], saved:[], attending:[], bookings:[], plans:[],
 events:[
 {id:'e1',title:'AFTER HOURS',subtitle:'A little later. A little louder.',category:'Music',location:'Arts District, Los Angeles',date:day(5),price:25,capacity:200,going:84,friends:['Maya','Jordan','Alex'],style:'acid',owner:'Nightshift',status:'published'},
 {id:'e2',title:'GOLDEN HOUR',subtitle:'Rooftop sounds & city sunsets.',category:'Social',location:'Downtown Los Angeles',date:day(7),price:35,capacity:120,going:62,friends:['Sam','Maya'],style:'sun',owner:'Golden Collective',status:'published'},
 {id:'e3',title:'FRAME / WORK',subtitle:'Meet the people behind the lens.',category:'Creative',location:'Silver Lake, Los Angeles',date:day(9),price:0,capacity:60,going:28,friends:['Alex'],style:'violet',owner:'Frame Club',status:'published'}
 ],
 posts:[
 {id:'p1',author:'Maya Chen',handle:'maya',text:'Who’s coming to After Hours? Putting together a little crew. Meet at 8?',eventId:'e1',likes:24,liked:false,comments:[{author:'Jordan',text:'Count me in.'}],createdAt:now-1800000},
 {id:'p2',author:'Nightshift',handle:'nightshift',text:'Good music. Familiar faces. A room full of new connections. The next chapter starts Friday.',eventId:'e1',likes:48,liked:false,comments:[],createdAt:now-5400000},
 {id:'p3',author:'Alex Rivera',handle:'alexframes',text:'Some of the best collaborations start with showing up. Looking forward to meeting more local creatives.',eventId:'e3',likes:12,liked:false,comments:[],createdAt:now-7200000}
 ],
 talent:[
 {id:'t1',name:'Alex Rivera',role:'Photographer',tag:'Events · Editorial · Nightlife',rate:150,style:'violet',bio:'Candid moments, considered frames. Available for events and brand sessions.',owner:'Alex Rivera'},
 {id:'t2',name:'DJ Nova',role:'DJ',tag:'House · Disco · Open format',rate:200,style:'acid',bio:'Warm-up sets to late-night dance floors. Bring your people; I’ll bring the sound.',owner:'DJ Nova'},
 {id:'t3',name:'Atlas Event Crew',role:'Security',tag:'Door staff · Event support',rate:75,style:'sun',bio:'Guest-focused event support and entry coordination.',owner:'Atlas Event Crew'}
 ]};
}
