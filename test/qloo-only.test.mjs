import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {Planner} from '../src/agent.mjs';
import {checkLiveJourney} from '../src/live-journey.mjs';
import {qlooOnlyEvidenceMatches,liveEvidenceMatches,currentLiveCodeFingerprint} from '../src/live-evidence.mjs';
import {qlooOnlyReadiness,readinessReport} from '../src/readiness.mjs';
import {buildP00Plan,exclusionRequest,replayP00} from '../src/p00.mjs';

const tastes=[{query:'Amélie',type:'movie',id:'abcdefab-1234-1234-1234-000000000001'},{query:'Aurora Aksnes',type:'artist',id:'abcdefab-1234-1234-1234-000000000002'}];
async function setup(t,rankOverride){
  const calls={qloo:0,openai:0};
  const provider={source:'qloo',async search(query){calls.qloo++;return tastes.filter(t=>t.query===query).map(t=>({...t,name:t.query}));},async rank(candidates,confirmed,primary){calls.qloo++;return rankOverride?rankOverride(candidates,confirmed,primary):{rows:candidates.map(c=>({workKey:c.workKey})),queriedAt:new Date().toISOString(),omitted:[],warning:'Controlled Qloo test'};}};
  const planner=new Planner({enabled:false,key:'unfunded',budget:{reserve(){calls.openai++;throw Error('Must not reserve OpenAI');}},fetchImpl:()=>{throw Error('Must not call OpenAI');}});
  const app=createApp({mode:'qloo_only',provider,planner});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
  return {base:`http://127.0.0.1:${app.address().port}`,calls,reservations:()=>calls.qloo};
}
const binding={planFingerprint:'plan',codeFingerprint:currentLiveCodeFingerprint(),tasteIds:tastes.map(t=>t.id)};
function smoke(){
  const checks=['bootstrap','confirmed_searches','initial_decision','confirmed_exclusion','lower_budget','gift_card','session_restore','no_stock_no_calls'].map(id=>({id,state:'passed'}));
  checks[1].tasteIds=binding.tasteIds;
  for(const [i,id]of ['initial_decision','confirmed_exclusion','lower_budget'].entries())Object.assign(checks.find(c=>c.id===id),{hardConstraintViolations:[],workKeys:i?['bookshop']:['piranesi'],version:i+1,budgetMinor:i===2?1500:2500});
  return {state:'passed',source:'live_qloo_only_http',mode:'qloo_only',agent:'deterministic',model:null,qlooOnlyEndToEndVerified:true,liveEndToEndVerified:false,liveQlooVerified:true,...binding,providerCallsReserved:5,calls:{qloo:5,openai:0},checks};
}

test('Qloo-only HTTP journey uses five Qloo calls and zero OpenAI calls',async t=>{
  const h=await setup(t),checks=await checkLiveJourney({...h,tastes,execution:'deterministic'});
  assert.equal(checks.length,8);assert.ok(checks.every(c=>c.state==='passed'));assert.deepEqual(h.calls,{qloo:5,openai:0});
  const bootstrap=await (await fetch(h.base+'/api/bootstrap')).json();assert.equal(bootstrap.mode,'qloo_only');assert.equal(bootstrap.agent,'deterministic');assert.deepEqual(bootstrap.presets,[]);
});

test('Qloo-only cannot silently become fixture or enable the OpenAI planner',()=>{
  assert.throws(()=>createApp({mode:'qloo_only'}),/requires Qloo/);
  assert.throws(()=>createApp({mode:'qloo_only',provider:{source:'qloo'},planner:new Planner({enabled:true})}),/disabled LLM/);
  assert.throws(()=>createApp({mode:'other'}),/Choose/);
});

test('Two-provider journey checker rejects the deterministic mode before spending calls',async t=>{
  const h=await setup(t);await assert.rejects(checkLiveJourney({...h,tastes}),{code:'live_source_mismatch'});assert.equal(h.calls.qloo,0);
});

test('Qloo-only evidence cannot unlock full live and rejects stale, altered or incomplete proofs',()=>{
  assert.equal(qlooOnlyEvidenceMatches(smoke(),binding),true);assert.equal(liveEvidenceMatches(smoke(),{...binding,model:null}),false);
  for(const patch of [{source:'fixture'},{source:'mock'},{mode:'live'},{agent:'llm_tool_loop'},{codeFingerprint:'stale'},{planFingerprint:'stale'},{model:'gpt-4.1-mini'},{calls:{qloo:4,openai:1}},{providerCallsReserved:4},{checks:[]},{liveEndToEndVerified:true}])assert.equal(qlooOnlyEvidenceMatches({...smoke(),...patch},binding),false);
  const excluded=smoke();excluded.checks.find(c=>c.id==='confirmed_exclusion').workKeys=['piranesi'];assert.equal(qlooOnlyEvidenceMatches(excluded,binding),false);
  const expensive=smoke();expensive.checks.find(c=>c.id==='lower_budget').workKeys=['dune'];assert.equal(qlooOnlyEvidenceMatches(expensive,binding),false);
  assert.equal(qlooOnlyEvidenceMatches(smoke(),{...binding,tasteIds:['unconfirmed']}),false);
});

function readinessOptions(){
  const review=JSON.parse(readFileSync(new URL('../data/qloo-review.example.json',import.meta.url),'utf8'));let n=100;const identities=new Map();
  const uuid=()=>`abcdefab-1234-1234-1234-${String(n++).padStart(12,'0')}`;
  for(const w of review.works){w.identityReviewed=true;w.qlooEntityId=uuid();identities.set(`book:${w.title}`,w.qlooEntityId);}
  for(const p of review.profiles)for(const t of p.tastes){const key=`${t.type}:${t.query}`;if(!identities.has(key))identities.set(key,uuid());t.identityReviewed=true;t.qlooEntityId=identities.get(key);}
  const p00Plan=buildP00Plan(review);
  const capture=r=>({id:r.id,method:r.method,path:r.path,params:{...r.params},response:{results:{entities:r.candidateWorkKeys.slice(0,3).map(k=>({entity_id:p00Plan.mapping[k]}))}}});
  const captures=p00Plan.requests.map(capture);captures.push(capture(exclusionRequest(p00Plan,p00Plan.requests[0].candidateWorkKeys[0])));
  const p00={...replayP00(p00Plan,captures),source:'qloo',transport:'cli',liveQlooVerified:true};
  const qlooOnlySmoke={...smoke(),planFingerprint:p00Plan.fingerprint,checks:structuredClone(smoke().checks)};
  qlooOnlySmoke.checks[1].tasteIds=p00Plan.requests.find(r=>r.id==='T01').tasteIds;
  return {env:{QLOO_API_KEY:'secret-qloo',QLOO_CONTRACT_APPROVED:'true'},mapping:p00Plan.mapping,p00Plan,p00,qlooOnlySmoke,transportCheck:{kind:'cli',ready:true},liveCodeFingerprint:binding.codeFingerprint};
}

test('Qloo-only preflight passes without an OpenAI key while full live remains blocked',()=>{
  const options=readinessOptions(),report=qlooOnlyReadiness(options);
  assert.equal(report.runtimeConfigurationReady,true);assert.equal(report.liveIntegrationEvidenceReady,true);assert.equal(report.liveEndToEndVerified,false);assert.equal(report.releaseReady,false);assert.ok(report.remainingReleaseGates.includes('agent_integration'));assert.ok(!Object.hasOwn(report.checks,'openAIKeyConfigured'));assert.ok(!JSON.stringify(report).includes('secret-qloo'));
  assert.equal(readinessReport({...options,liveSmoke:options.qlooOnlySmoke}).liveIntegrationEvidenceReady,false);
});

test('Qloo-only preflight retains P00, CLI, approval and all-eligible-mapping gates',()=>{
  const options=readinessOptions();assert.equal(qlooOnlyReadiness({...options,p00:null}).liveIntegrationEvidenceReady,false);
  assert.equal(qlooOnlyReadiness({...options,qlooOnlySmoke:null}).liveIntegrationEvidenceReady,false);
  assert.equal(qlooOnlyReadiness({...options,transportCheck:{kind:'cli',ready:false}}).runtimeConfigurationReady,false);
  assert.equal(qlooOnlyReadiness({...options,env:{...options.env,QLOO_CONTRACT_APPROVED:'false'}}).runtimeConfigurationReady,false);
  const mapping={...options.mapping};delete mapping.piranesi;assert.equal(qlooOnlyReadiness({...options,mapping}).runtimeConfigurationReady,false);
});

test('Qloo-only provider failure preserves the prior decision without fixture substitution',async t=>{
  let broken=false;const h=await setup(t,candidates=>{if(broken)throw Object.assign(Error('Qloo unavailable'),{status:503,code:'source_unavailable'});return {rows:candidates.map(c=>({workKey:c.workKey})),queriedAt:new Date().toISOString()};});let cookie='';
  const api=async(path,body)=>{const res=await fetch(h.base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});cookie=res.headers.get('set-cookie')?.split(';')[0]||cookie;return {status:res.status,data:await res.json()};};
  for(const t of tastes)await api(`/api/search?query=${encodeURIComponent(t.query)}&type=${t.type}`);
  const first=(await api('/api/decide',{budgetMinor:2500,tasteIds:tastes.map(t=>t.id),unavailableWorkKey:'priory'})).data.decision;broken=true;
  assert.equal((await api('/api/refine',{kind:'budget',budgetMinor:1500,version:first.version,decisionId:first.id})).status,503);
  const current=(await api('/api/decision')).data.decision;assert.equal(current.id,first.id);assert.equal(current.source,'qloo');assert.equal(h.calls.openai,0);
});
