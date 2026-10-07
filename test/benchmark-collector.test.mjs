import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareBenchmark,benchmarkUnits,baselineCaptures,checkBenchmarkCaptures,summarizeBenchmark} from '../src/benchmark.mjs';
import {newCollection,inspectCollection,collectBenchmark,rankWithOpenAI,benchmarkExecutor} from '../src/benchmark-collector.mjs';
import {DailyBudget} from '../src/budget.mjs';

function ready(){
  const review=JSON.parse(readFileSync(new URL('../data/qloo-review.example.json',import.meta.url),'utf8'));let n=1;const ids=new Map();
  const uuid=()=>`${String(n++).padStart(8,'0')}-1111-4111-8111-111111111111`;
  for(const w of review.works){w.identityReviewed=true;w.qlooEntityId=uuid();ids.set(w.title,w.qlooEntityId);}
  for(const p of review.profiles)for(const t of p.tastes){if(!ids.has(t.query))ids.set(t.query,uuid());t.identityReviewed=true;t.qlooEntityId=ids.get(t.query);}
  return prepareBenchmark(review);
}
const units=plan=>benchmarkUnits(plan).filter(u=>u.method!=='B0');
function harness(plan=ready()){
  const journal=newCollection(plan);let calls=0;const snapshots=[];
  return {plan,journal,snapshots,budget:{remaining:()=>60-calls,reserve(){calls++;}},persist(value){snapshots.push(structuredClone(value));}};
}
function success(unit,budget){
  if(['B1','Full'].includes(unit.method)){budget.reserve('openai');if(unit.method==='Full')budget.reserve('openai');}
  if(['B2','Full'].includes(unit.method))budget.reserve('qloo');
  return {state:'ready',workKeys:unit.shelf.slice(0,3).map(e=>e.workKey)};
}
function captured(plan,u){return {id:u.id,state:u.shelf.length?'ready':'no_eligible_stock',workKeys:u.shelf.slice(0,3).map(e=>e.workKey),durationMs:1,calls:{qloo:u.shelf.length&&['B2','Full'].includes(u.method)?1:0,openai:u.shelf.length?(u.method==='B1'?1:u.method==='Full'?2:0):0},source:{B1:'openai',B2:'qloo',Full:'openai_qloo'}[u.method],model:u.method==='B2'?null:plan.model,recordedAt:new Date().toISOString()};}

test('Collector checkpoints reservations and resumes only missing slots, retaining provider failures',async()=>{
  const h=harness();let attempted=[];
  const first=await collectBenchmark({...h,execute:async(u,b)=>{attempted.push(u.id);b.reserve('openai');throw Object.assign(Error('secret raw provider message'),{code:'planner_unavailable'});}});
  assert.equal(first.reason,'provider_failure');assert.equal(first.providerCallsReserved,1);assert.equal(h.journal.captures[0].failureCode,'planner_unavailable');
  assert.ok(h.snapshots.some(s=>s.pending?.calls.openai===1));assert.ok(!JSON.stringify(h.journal).includes('secret'));
  const second=await collectBenchmark({...h,maxUnits:1,execute:async(u,b)=>{attempted.push(u.id);return success(u,b);}});
  assert.equal(second.reason,'unit_limit');assert.equal(attempted.length,2);assert.notEqual(attempted[0],attempted[1]);assert.equal(h.journal.captures.length,2);
});

test('Worst-case headroom prevents starting a Full unit that might exhaust either budget',async()=>{
  const h=harness();const all=units(h.plan),full=all.find(u=>u.method==='Full');h.journal.captures=all.slice(0,all.indexOf(full)).map(u=>captured(h.plan,u));
  const execute=()=>{throw Error('Must not start');};
  const perRun=await collectBenchmark({...h,maxCalls:3,execute});assert.equal(perRun.reason,'run_limit');assert.equal(h.journal.pending,null);
  const daily=await collectBenchmark({...h,budget:{remaining:()=>3,reserve(){throw Error('Must not reserve');}},execute});assert.equal(daily.reason,'daily_limit');assert.equal(daily.providerCallsReserved,0);
});

test('Interrupted paid slot becomes one terminal failure without a provider retry',async()=>{
  const h=harness(),u=units(h.plan)[0];h.journal.pending={id:u.id,startedAt:new Date().toISOString(),calls:{openai:1,qloo:0}};
  const report=await collectBenchmark({...h,execute:()=>{throw Error('Must not retry');}});
  assert.equal(report.reason,'interrupted');assert.equal(report.providerCallsReserved,0);assert.equal(h.journal.captures[0].failureCode,'collector_interrupted');assert.equal(h.journal.captures[0].calls.openai,1);assert.equal(h.journal.pending,null);
  assert.equal(h.journal.captures[0].durationMs,null);
  const captures=[...baselineCaptures(h.plan),...h.journal.captures,...units(h.plan).slice(1).map(u=>captured(h.plan,u))];
  const summary=summarizeBenchmark(h.plan,captures,[]),b1=summary.operations.find(o=>o.method==='B1');
  assert.equal(b1.unknownDurationOutcomes,1);assert.equal(b1.medianDurationMs,1);
});

test('No-stock slots, including interrupted ones, complete with zero external calls',async()=>{
  const h=harness(),all=units(h.plan);h.journal.captures=all.filter(u=>u.shelf.length).map(u=>captured(h.plan,u));
  const execute=()=>{throw Error('No-stock must bypass providers');};
  const result=await collectBenchmark({...h,maxUnits:154,maxCalls:1,budget:{remaining:()=>0,reserve(){throw Error('Must not reserve');}},execute});
  assert.equal(result.reason,'complete');assert.equal(result.providerCallsReserved,0);assert.equal(h.journal.captures.length,154);
  const check=checkBenchmarkCaptures(h.plan,[...baselineCaptures(h.plan),...h.journal.captures]);assert.equal(check.invalid,0);assert.equal(check.missing,0);
  const interrupted=harness(h.plan),u=all.find(u=>!u.shelf.length);interrupted.journal.pending={id:u.id,startedAt:new Date().toISOString(),calls:{openai:0,qloo:0}};
  await collectBenchmark({...interrupted,execute});assert.equal(interrupted.journal.captures[0].state,'no_eligible_stock');
});

test('Frozen plan, duplicate outcomes and corrupted journals are rejected before provider use',()=>{
  const h=harness(),u=units(h.plan)[0];h.journal.captures=[captured(h.plan,u),captured(h.plan,u)];assert.throws(()=>inspectCollection(h.plan,h.journal));
  h.journal.captures=[];h.journal.planFingerprint='other';assert.throws(()=>inspectCollection(h.plan,h.journal));
  h.journal.planFingerprint=h.plan.fingerprint;h.journal.pending={id:u.id,startedAt:new Date().toISOString(),calls:{openai:99,qloo:0}};assert.throws(()=>inspectCollection(h.plan,h.journal));
});

test('Invalid works, provider counts and per-method overspending become preserved failures',async()=>{
  for(const execute of [async(u,b)=>{b.reserve('openai');return {state:'ready',workKeys:['invented']};},async(u)=>({state:'ready',workKeys:[u.shelf[0].workKey]}),async(u,b)=>{b.reserve('openai');b.reserve('openai');return success(u,b);}]){
    const h=harness(),r=await collectBenchmark({...h,execute});assert.equal(r.reason,'provider_failure');assert.equal(h.journal.captures[0].state,'failed');assert.ok(r.providerCallsReserved<=1);
  }
});

function response(workKeys,patch={}){return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({workKeys})}]}],...patch}),{headers:{'Content-Type':'application/json'}});}

test('B1 gets full shelf metadata and taste labels, strict output, no Qloo IDs or tools',async()=>{
  const plan=ready(),unit=units(plan)[0];let body,calls=0;
  const result=await rankWithOpenAI({plan,unit,key:'test-key',budget:{reserve(p){assert.equal(p,'openai');calls++;}},fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(opts.body);return response([unit.shelf[0].workKey]);}});
  assert.equal(calls,1);assert.equal(result.state,'ready');assert.equal(body.store,false);assert.equal(body.model,plan.model);assert.equal(body.text.format.strict,true);assert.ok(!('tools'in body));
  const context=JSON.parse(body.input[0].content);assert.deepEqual(context.shelf,unit.shelf);assert.deepEqual(context.tastes,unit.tastes.map(({name,type})=>({name,type})));assert.ok(!JSON.stringify(context).includes(unit.tastes[0].entityId));
});

test('B1 rejects incomplete, extra-field, repeated, foreign and refused responses without retry',async()=>{
  const plan=ready(),unit=units(plan)[0],key=unit.shelf[0].workKey;
  for(const make of [()=>response([key],{status:'incomplete'}),()=>response([key,key]),()=>response(['foreign']),()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'private prose'}]}]})),()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({workKeys:[key],priceMinor:1})}]}]}))]){
    let calls=0;await assert.rejects(rankWithOpenAI({plan,unit,key:'test',budget:{reserve(){calls++;}},fetchImpl:async()=>make()}));assert.equal(calls,1);
  }
});

test('B1 bounds uncooperative transports and sanitizes billing errors',async()=>{
  const plan=ready(),unit=units(plan)[0];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25);
  try{await assert.rejects(rankWithOpenAI({plan,unit,key:'test',budget:{reserve(){}},signal:controller.signal,fetchImpl:()=>new Promise(()=>{})}),e=>e.code==='planner_unavailable');}finally{clearTimeout(timer);}
  await assert.rejects(rankWithOpenAI({plan,unit,key:'test',budget:{reserve(){}},fetchImpl:async()=>new Response(JSON.stringify({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'private'} }),{status:429})}),e=>e.failureKind==='billing_or_quota'&&!e.message.includes('private'));
});

test('B2 is static all-confirmed Qloo and Full uses the existing inspect then rank loop',async()=>{
  const plan=ready();let strategies=[],plannerCalls=0;
  const execute=benchmarkExecutor({plan,key:'test',providerFactory:budget=>({source:'qloo',async rank(shelf,tastes,primary){strategies.push(primary);assert.ok(tastes.every(t=>t.id));budget.reserve('qloo');return {rows:shelf.slice(0,3).map(e=>({workKey:e.workKey}))};}}),fetchImpl:async(url,opts)=>{
    plannerCalls++;const input=JSON.parse(opts.body).input;const inspect=input.length===1;
    return new Response(JSON.stringify({output:[{type:'function_call',name:inspect?'inspect_shelf':'rank_shelf',call_id:`call${plannerCalls}`,arguments:JSON.stringify(inspect?{}:{strategy:'all_confirmed'})}]}));
  }});
  const b2=units(plan).find(u=>u.method==='B2'),full=units(plan).find(u=>u.method==='Full'),reserved=[];
  assert.equal((await execute(b2,{reserve:p=>reserved.push(p)})).state,'ready');assert.equal(plannerCalls,0);
  assert.equal((await execute(full,{reserve:p=>reserved.push(p)})).state,'ready');assert.equal(plannerCalls,2);assert.deepEqual(strategies,[null,null]);assert.deepEqual(reserved,['qloo','openai','openai','qloo']);
  await assert.rejects(benchmarkExecutor({plan,key:'test',providerFactory:()=>({source:'fixture'})})(b2,{}),e=>e.code==='benchmark_contract');
});

test('Daily headroom respects persisted reservations, UTC rollover and corrupt-ledger refusal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-collector-'));
  try{
    const budget=new DailyBudget(dir,2);assert.equal(budget.remaining(),2);budget.reserve('openai');assert.equal(new DailyBudget(dir,2).remaining(),1);budget.reserve('qloo');assert.equal(budget.remaining(),0);assert.throws(()=>budget.reserve('openai'));
    writeFileSync(join(dir,'budget.json'),JSON.stringify({day:'2000-01-01',calls:2}));assert.equal(budget.remaining(),2);
    writeFileSync(join(dir,'budget.json'),'broken');assert.throws(()=>budget.remaining(),e=>e.code==='budget_limited');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
