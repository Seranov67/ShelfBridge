import {catalog,fixtureTastes,eligibleEditions,catalogVersion} from './catalog.mjs';
import {FixtureProvider} from './providers.mjs';
import {Planner,decide} from './agent.mjs';
import {validateRequest,refine} from './policy.mjs';

// Predeclared tasks from docs/EVALUATION.md; these names are never live Qloo IDs.
export const evaluationTasks=[
  {id:'T01',tastes:['Amélie','AURORA'],budgetMinor:2500,unavailableWorkKey:'priory',repair:{kind:'exclude'}},
  {id:'T02',tastes:['Arrival','Radiohead'],budgetMinor:2500,unavailableWorkKey:'memory-empire',repair:{kind:'budget',budgetMinor:1600}},
  {id:'T03',tastes:['Knives Out','The Grand Budapest Hotel'],budgetMinor:2000,unavailableWorkKey:'gone-girl',repair:{kind:'exclude'}},
  {id:'T04',tastes:['Before Sunrise','Hozier'],budgetMinor:2000,unavailableWorkKey:'normal-people',repair:{kind:'budget',budgetMinor:1400}},
  {id:'T05',tastes:['Interstellar','Arrival'],budgetMinor:2300,unavailableWorkKey:'memory-empire',repair:{kind:'remove_taste',name:'Interstellar'}},
  {id:'T06',tastes:['Her','Radiohead'],budgetMinor:2000,unavailableWorkKey:'normal-people',repair:{kind:'exclude'}},
  {id:'T07',tastes:['A Wizard of Earthsea','AURORA'],budgetMinor:1800,unavailableWorkKey:'priory',repair:{kind:'budget',budgetMinor:1500}},
  {id:'T08',tastes:['Piranesi','Amélie'],budgetMinor:2200,unavailableWorkKey:'night-circus',repair:{kind:'exclude'}},
  {id:'T09',tastes:['The Thursday Murder Club','Knives Out'],budgetMinor:1800,unavailableWorkKey:'gone-girl',repair:{kind:'budget',budgetMinor:1300}},
  {id:'T10',tastes:['The Long Way to a Small, Angry Planet','Hozier'],budgetMinor:2200,unavailableWorkKey:'memory-empire',repair:{kind:'remove_taste',name:'Hozier'}},
  {id:'T11',tastes:['Arrival','Radiohead'],budgetMinor:100,unavailableWorkKey:'memory-empire',repair:null},
  {id:'T12',tastes:['Amélie','AURORA'],budgetMinor:1100,unavailableWorkKey:'little-prince',repair:null}
];

export function hardConstraintViolations(decision,request) {
  const eligible=new Map(eligibleEditions(request).map(e=>[e.workKey,e]));const errors=[];
  if(decision.budgetMinor!==request.budgetMinor)errors.push('budget_changed');
  if(new Set(decision.cards.map(c=>c.workKey)).size!==decision.cards.length)errors.push('duplicate_work');
  if(decision.cards.length>3)errors.push('too_many_cards');
  for(const card of decision.cards) {
    const edition=eligible.get(card.workKey);
    if(!edition){errors.push('ineligible_work');continue;}
    for(const key of ['sku','title','author','priceMinor','stockCount','stockAsOf','currency','format'])if(card[key]!==edition[key])errors.push(`catalog_fact_changed:${key}`);
  }
  if(!eligible.size&&(decision.state!=='no_eligible_stock'||decision.cards.length))errors.push('no_stock_not_reported');
  return [...new Set(errors)];
}

export async function evaluateFixtures() {
  const knownTastes=new Map(fixtureTastes.map(t=>[t.id,t]));const knownWorks=new Set(catalog.map(e=>e.workKey));const results=[];
  for(const task of evaluationTasks) {
    const tastes=task.tastes.map(name=>{const taste=fixtureTastes.find(t=>t.name===name);if(!taste)throw Error('Unresolved fixture taste');return taste;});
    let calls=0;const fixture=new FixtureProvider();const provider={source:'fixture',rank:async(...args)=>{calls++;return fixture.rank(...args);}};
    const planner=new Planner({enabled:false});
    let request=validateRequest({...task,tasteIds:tastes.map(t=>t.id)},knownTastes,knownWorks);
    const first=await decide({request,tastes,provider,planner});const initialViolations=hardConstraintViolations(first,request);
    let repair=null;
    if(task.repair) {
      const body={...task.repair,version:1};
      if(body.kind==='exclude')body.workKey=first.cards[0]?.workKey;
      if(body.kind==='remove_taste')body.tasteId=tastes.find(t=>t.name===body.name)?.id;
      request=refine(request,body,first.cards,0);
      const changed=await decide({request,tastes:request.tasteIds.map(id=>knownTastes.get(id)),provider,planner,previous:first});
      const violations=hardConstraintViolations(changed,request);
      if(body.kind==='exclude'&&changed.cards.some(c=>c.workKey===body.workKey))violations.push('rejection_ignored');
      if(body.kind==='remove_taste'&&changed.evidence?.signalIds.includes(body.tasteId))violations.push('removed_taste_used');
      repair={kind:body.kind,state:changed.state,titles:changed.cards.map(c=>c.title),violations,durationMs:changed.durationMs??0};
    }
    if(!task.repair&&calls!==0)initialViolations.push('no_stock_spent_calls');
    results.push({task:task.id,source:'fixture',state:first.state,titles:first.cards.map(c=>c.title),violations:initialViolations,repair,fixtureRankCalls:calls,durationMs:first.durationMs??0});
  }
  const violations=results.reduce((n,r)=>n+r.violations.length+(r.repair?.violations.length||0),0);
  return {checkedAt:new Date().toISOString(),catalogVersion,source:'fixture',method:'deterministic_teaching_workflow',liveQlooVerified:false,qualityBenchmark:false,state:violations?'failed':'passed',tasks:results.length,repairs:results.filter(r=>r.repair).length,noStockTasks:results.filter(r=>r.state==='no_eligible_stock').length,hardConstraintViolations:violations,results};
}
