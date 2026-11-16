import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../project/progress.json',import.meta.url),'utf8'));
const states=new Set(['backlog','ready','in_progress','verification','done','blocked']);
const errors=[], byId=new Map();
for(const t of data.tasks){
 if(byId.has(t.id))errors.push('Duplicate task '+t.id);
 byId.set(t.id,t);
 if(!states.has(t.status))errors.push('Invalid status for '+t.id);
 if(!t.title || !t.acceptance || !Array.isArray(t.dependsOn) || !Array.isArray(t.evidence))errors.push('Incomplete task '+t.id);
 if(t.status==='done' && !t.evidence.length)errors.push('Done needs evidence: '+t.id);
 if(t.status==='blocked' && (!t.blocker?.cause || !t.blocker?.retryCondition || !t.blocker?.nextAction))errors.push('Blocked needs cause/retry condition/next action: '+t.id);
}
for(const t of data.tasks){
 for(const dep of t.dependsOn){
  if(!byId.has(dep))errors.push('Unknown dependency '+dep+' for '+t.id);
  else if(['done','ready','in_progress','verification'].includes(t.status)&&byId.get(dep).status!=='done')errors.push(t.id+' cannot be '+t.status+' before '+dep+' is done');
 }
}
const visiting=new Set(),visited=new Set();
function visit(id){
 if(visiting.has(id)){errors.push('Dependency cycle at '+id);return;}
 if(visited.has(id)||!byId.has(id))return;
 visiting.add(id);for(const dep of byId.get(id).dependsOn)visit(dep);visiting.delete(id);visited.add(id);
}
for(const t of data.tasks)visit(t.id);
const active=data.tasks.filter(t=>['in_progress','verification'].includes(t.status));
if(active.length>data.workInProgressLimit)errors.push('Work-in-progress limit exceeded');
if(!byId.has(data.currentSession.nextTask))errors.push('Next task does not exist');
const next=byId.get(data.currentSession.nextTask);
if(next && !['ready','in_progress','verification'].includes(next.status))errors.push('Next task is not actionable');
const ready=data.tasks.filter(t=>t.status!=='done'&&t.status!=='blocked'&&t.dependsOn.every(d=>byId.get(d)?.status==='done')).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
const safe=s=>String(s).replaceAll('|','/').replaceAll('\n',' ');
const lines=['# Project progress','',data.objective,'',
 'Counts describe tracked milestones, NOT a percentage of product completion.','',
 '| Status | Tasks |','|---|---|',...[...states].map(s=>'| '+s+' | '+data.tasks.filter(t=>t.status===s).length+' |'),'',
 '## Next designated task','',data.currentSession.nextTask+': '+(next?.title||'INVALID'),'',
 data.currentSession.reason,'','## Ready queue','','| ID | Priority | Task | Acceptance |','|---|---|---|---|',
 ...ready.map(t=>'| '+t.id+' | P'+t.priority+' | '+safe(t.title)+' | '+safe(t.acceptance)+' |'),
 '','## Blockers and retry gates',''];
for(const t of data.tasks.filter(t=>t.status==='blocked'))lines.push('### '+t.id+' — '+t.title,'',t.blocker.cause,'','Retry only when: '+t.blocker.retryCondition,'','Next action: '+t.blocker.nextAction,'');
lines.push('## Completed evidence','','| ID | Completed milestone | Evidence |','|---|---|---|');
for(const t of data.tasks.filter(t=>t.status==='done'))lines.push('| '+t.id+' | '+safe(t.title)+' | '+t.evidence.map((e,i)=>'[Evidence '+(i+1)+']('+e+')').join(', ')+' |');
lines.push('','Evidence links are required metadata. This workflow does not independently certify linked results. Completion still requires reviewing actual test/deployment evidence.','',
 '## Session rules','','One primary task at a time. No repeating failed approaches without changed evidence. Split oversized tasks. Update progress.json and SESSION.md after verification. Cloud blockers do not stop independent UI/backend work.','');
if(errors.length)lines.push('## Validation errors','',...errors.map(e=>'- '+e));
const report=lines.join('\n');
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/progress.md',report);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,report);
console.log(report);
if(errors.length)process.exitCode=1;
