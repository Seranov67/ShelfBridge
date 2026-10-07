import {assertBenchmark,benchmarkUnits,baselineCaptures,checkBenchmarkCaptures} from './benchmark.mjs';
import {Planner,decide} from './agent.mjs';
import {assertRanking,fail} from './policy.mjs';
import {readProviderJson,withSignal} from './http.mjs';
import {plannerFailure} from './provider-errors.mjs';

const sources={B1:'openai',B2:'qloo',Full:'openai_qloo'};
const caps={B1:{qloo:0,openai:1},B2:{qloo:1,openai:0},Full:{qloo:1,openai:3}};
const failureCodes=new Set(['planner_unavailable','planner_contract','source_unavailable','source_contract','budget_limited','cancelled','benchmark_contract','collector_interrupted']);
const failureCode=error=>failureCodes.has(error?.code)?error.code:'collector_error';
const baseCapture=(plan,unit)=>({id:unit.id,state:'failed',workKeys:[],durationMs:0,calls:{qloo:0,openai:0},source:sources[unit.method],model:unit.method==='B2'?null:plan.model,recordedAt:new Date().toISOString()});

export function newCollection(plan) {
  assertBenchmark(plan);
  if(plan.state!=='prepared')throw fail('Review benchmark identities before collection.',400,'benchmark_contract');
  return {schemaVersion:1,planFingerprint:plan.fingerprint,captures:[],pending:null};
}

export function inspectCollection(plan,journal) {
  const units=benchmarkUnits(plan).filter(u=>u.method!=='B0');
  if(plan.state!=='prepared'||!journal||Object.keys(journal).sort().join(',')!=='captures,pending,planFingerprint,schemaVersion'||journal.schemaVersion!==1||journal.planFingerprint!==plan.fingerprint||!Array.isArray(journal.captures)||journal.captures.some(c=>!units.some(u=>u.id===c?.id)))throw fail('Collection does not match the frozen plan.',400,'benchmark_contract');
  const captures=[...journal.captures];
  if(journal.pending!==null){
    const p=journal.pending;
    if(!p||Object.keys(p).sort().join(',')!=='calls,id,startedAt'||!units.some(u=>u.id===p.id)||captures.some(c=>c.id===p.id))throw fail('Invalid unfinished collection unit.',400,'benchmark_contract');
    const unit=units.find(u=>u.id===p.id);
    captures.push({...baseCapture(plan,unit),recordedAt:p.startedAt,calls:p.calls,...(unit.shelf.length?{failureCode:'collector_interrupted',durationMs:null}:{state:'no_eligible_stock'})});
  }
  const report=checkBenchmarkCaptures(plan,[...baselineCaptures(plan),...captures]);
  if(report.invalid)throw fail('Collection contains invalid outcomes.',400,'benchmark_contract');
  return {units,report,pendingCapture:journal.pending?captures.at(-1):null};
}

// Persist the pending slot before invoking a provider. An interrupted slot is
// terminal: resuming retains its failure rather than selecting a new result.
export async function collectBenchmark({plan,journal,budget,execute,persist,maxUnits=8,maxCalls=12}) {
  if(!Number.isInteger(maxUnits)||maxUnits<1||maxUnits>154||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>60)throw fail('Invalid collection batch bounds.',400,'benchmark_contract');
  const {units,pendingCapture}=inspectCollection(plan,journal);
  let providerCallsReserved=0,completedThisRun=0;
  const summary=reason=>({state:reason==='complete'?'complete':'stopped',reason,completedThisRun,providerCallsReserved,totalCaptured:journal.captures.length,missing:units.length-journal.captures.length,planFingerprint:plan.fingerprint,qualityBenchmark:false});
  if(pendingCapture){journal.captures.push(pendingCapture);journal.pending=null;persist(journal);return summary('interrupted');}
  const captured=new Set(journal.captures.map(c=>c.id));
  for(const unit of units){
    if(captured.has(unit.id))continue;
    if(completedThisRun>=maxUnits)return summary('unit_limit');
    const cap=caps[unit.method],maximum=unit.shelf.length?cap.qloo+cap.openai:0;
    if(maxCalls-providerCallsReserved<maximum)return summary('run_limit');
    if(budget.remaining()<maximum)return summary('daily_limit');
    const started=Date.now(),capture=baseCapture(plan,unit);
    journal.pending={id:unit.id,startedAt:capture.recordedAt,calls:capture.calls};persist(journal);
    const reservation={reserve(provider){
      if(!Object.hasOwn(cap,provider)||capture.calls[provider]>=cap[provider])throw fail('Method exceeded its provider boundary.',502,'benchmark_contract');
      budget.reserve(provider);capture.calls[provider]++;providerCallsReserved++;
      // Failure to persist aborts before sending the external request. If the
      // process dies between ledger and journal writes, a reservation may be
      // absent from the capture, but stays spent in the shared daily ledger.
      persist(journal);
    }};
    try{
      const deadline=AbortSignal.timeout(20000);
      const result=unit.shelf.length?await withSignal(execute(unit,reservation,deadline),deadline):{state:'no_eligible_stock',workKeys:[]};
      capture.state=result.state;capture.workKeys=result.workKeys;capture.durationMs=Date.now()-started;
      const check=checkBenchmarkCaptures(plan,[...baselineCaptures(plan),...journal.captures,capture]);
      if(check.invalid)throw fail('Method returned an invalid outcome.',502,'benchmark_contract');
    }catch(error){capture.state='failed';capture.workKeys=[];capture.failureCode=failureCode(error);capture.durationMs=Math.min(120000,Date.now()-started);}
    journal.captures.push(capture);journal.pending=null;persist(journal);completedThisRun++;
    if(capture.state==='failed')return summary('provider_failure');
  }
  return summary('complete');
}

// B1 has full eligible metadata and confirmed taste labels, but no Qloo IDs or
// tools. One Responses request, validated server-side even with strict output.
export async function rankWithOpenAI({unit,plan,key,budget,fetchImpl=fetch,signal}) {
  if(typeof key!=='string'||!key.trim()||key.startsWith('<'))throw fail('Planner key missing.',503,'planner_unavailable');
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
  deadline.throwIfAborted();budget.reserve('openai');let data;
  try{
    const response=await withSignal(fetchImpl('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},redirect:'error',signal:deadline,
      body:JSON.stringify({model:plan.model,store:false,instructions:plan.b1Prompt,
        input:[{role:'user',content:JSON.stringify({request:unit.request,tastes:unit.tastes.map(({name,type})=>({name,type})),shelf:unit.shelf})}],
        max_output_tokens:900,text:{format:{type:'json_schema',name:'shelf_ranking',strict:true,schema:{type:'object',properties:{workKeys:{type:'array',items:{type:'string',enum:unit.shelf.map(e=>e.workKey)},maxItems:3}},required:['workKeys'],additionalProperties:false}}}})
    }),deadline);
    if(!response.ok)throw await plannerFailure(response,deadline);
    data=await readProviderJson(response,{signal:deadline,label:'Benchmark planner',code:'planner_contract'});
  }catch(error){if(error.status)throw error;throw fail('Benchmark planner unavailable.',503,'planner_unavailable');}
  if(data?.status!=='completed'||!Array.isArray(data.output)||data.output.length!==1)throw fail('Incomplete benchmark ranking.',502,'planner_contract');
  const message=data.output[0];
  if(message?.type!=='message'||message.role!=='assistant'||message.status!=='completed'||!Array.isArray(message.content)||message.content.length!==1||message.content[0]?.type!=='output_text')throw fail('Invalid benchmark message.',502,'planner_contract');
  let parsed;try{parsed=JSON.parse(message.content[0].text);}catch{throw fail('Unreadable benchmark ranking.',502,'planner_contract');}
  if(!parsed||Object.keys(parsed).join(',')!=='workKeys'||!Array.isArray(parsed.workKeys)||parsed.workKeys.length>3)throw fail('Invalid benchmark ranking.',502,'planner_contract');
  assertRanking(parsed.workKeys.map(workKey=>({workKey})),unit.shelf);
  return {state:parsed.workKeys.length?'ready':'insufficient_taste_data',workKeys:parsed.workKeys};
}

export function benchmarkExecutor({plan,key,providerFactory,fetchImpl=fetch}) {
  return async(unit,budget,signal)=>{
    if(unit.method==='B1')return rankWithOpenAI({unit,plan,key,budget,fetchImpl,signal});
    const provider=providerFactory(budget);
    if(provider.source!=='qloo')throw fail('Benchmark requires the real Qloo adapter.',502,'benchmark_contract');
    const tastes=unit.tastes.map(({entityId,name,type})=>({id:entityId,name,type}));
    if(unit.method==='B2'){
      const result=await provider.rank(unit.shelf,tastes,null,signal);assertRanking(result.rows,unit.shelf);
      const workKeys=result.rows.slice(0,3).map(r=>r.workKey);return {state:workKeys.length?'ready':'insufficient_taste_data',workKeys};
    }
    if(unit.method!=='Full')throw fail('Unknown collection method.',400,'benchmark_contract');
    const request={...unit.request,tasteIds:tastes.map(t=>t.id),version:unit.phase==='initial'?1:2};
    const result=await decide({request,tastes,provider,planner:new Planner({key,model:plan.model,budget,fetchImpl,enabled:true}),signal});
    if(result.source!=='qloo'||result.agent!=='llm_tool_loop')throw fail('Expected the live tool loop.',502,'benchmark_contract');
    return {state:result.state,workKeys:result.cards.map(c=>c.workKey)};
  };
}
