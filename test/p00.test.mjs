import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildP00Plan,exclusionRequest,deriveExclusionRequest,replayP00,p00EvidenceMatches,collectP00} from '../src/p00.mjs';
import {parseQlooSearch,parseQlooRanking} from '../src/qloo-contract.mjs';
import {readinessReport} from '../src/readiness.mjs';
import {catalog,catalogVersion} from '../src/catalog.mjs';
import {QlooProvider} from '../src/providers.mjs';
import {spawnSync} from 'node:child_process';

const template=()=>JSON.parse(readFileSync(new URL('../data/qloo-review.example.json',import.meta.url),'utf8'));
const uuid=n=>`abcdefab-1234-1234-1234-${String(n).padStart(12,'0')}`;
function reviewed() {
  const review=template();let next=100;const identities=new Map();
  for(const [i,work]of review.works.entries()){work.qlooEntityId=uuid(i);work.identityReviewed=true;identities.set(`book:${work.title}`,work.qlooEntityId);}
  for(const profile of review.profiles)for(const taste of profile.tastes){const key=`${taste.type}:${taste.query}`;if(!identities.has(key))identities.set(key,uuid(next++));taste.qlooEntityId=identities.get(key);taste.identityReviewed=true;}
  return review;
}
function capture(plan,request,keys=request.candidateWorkKeys.slice(0,3)) {
  return {id:request.id,method:request.method,path:request.path,params:{...request.params},response:{results:{entities:keys.map(key=>({entity_id:plan.mapping[key]}))}}};
}
function capturesFor(plan) {
  const captures=plan.requests.map(request=>capture(plan,request));
  const first=plan.requests.find(r=>r.id==='shelf-a').candidateWorkKeys[0];
  captures.push(capture(plan,exclusionRequest(plan,first)));return captures;
}
const operatorEvidence=report=>({...structuredClone(report),source:'qloo',transport:'cli',liveQlooVerified:true});

test('Incomplete review produces a blocked, credential-free plan without requests',()=>{
  const plan=buildP00Plan(template());assert.equal(plan.state,'blocked');assert.deepEqual(plan.requests,[]);assert.equal(plan.liveQlooVerified,false);assert.equal(plan.fingerprint,null);assert.equal(plan.maxRankingRequests,13);assert.ok(plan.blockers.includes('ten_reviewed_profiles_required'));
});
test('P00 covers disjoint eligible shelves, ten declared profiles and dependent exclusion',()=>{
  const plan=buildP00Plan(reviewed());assert.equal(plan.state,'planned');assert.equal(plan.requests.length,12);assert.equal(plan.requests.filter(r=>r.kind==='taste_profile').length,10);
  const [a,b]=plan.requests;assert.ok(a.candidateWorkKeys.every(key=>!b.candidateWorkKeys.includes(key)));assert.equal(a.candidateWorkKeys.length+b.candidateWorkKeys.length,26);
  const excluded=a.candidateWorkKeys[0];const control=exclusionRequest(plan,excluded);assert.ok(!control.candidateWorkKeys.includes(excluded));assert.deepEqual(control.tasteIds,a.tasteIds);assert.equal(control.params.take,a.params.take-1);
  for(const request of plan.requests){assert.equal(request.params['filter.type'],'urn:entity:book');assert.ok(!JSON.stringify(request).includes('fixture:'));assert.ok(!request.candidateWorkKeys.includes('priory'));}
});
test('P00 fingerprint is stable across review ordering but changes with an identity change',()=>{
  const review=reviewed(),plan=buildP00Plan(review);review.works.reverse();review.profiles.reverse();assert.equal(buildP00Plan(review).fingerprint,plan.fingerprint);
  review.works.find(w=>w.workKey==='ocean').qlooEntityId=uuid(999);assert.notEqual(buildP00Plan(review).fingerprint,plan.fingerprint);
});
test('Complete local replay checks all thirteen responses and never becomes live evidence',()=>{
  const plan=buildP00Plan(reviewed()),report=replayP00(plan,capturesFor(plan));assert.equal(report.state,'passed');assert.equal(report.capturesChecked,13);assert.equal(report.nonemptyProfiles,10);assert.equal(report.liveQlooVerified,false);assert.equal(report.contractApproved,false);assert.equal(p00EvidenceMatches(report,plan),false);
  assert.equal(readinessReport({mapping:plan.mapping,p00:report,p00Plan:plan}).evidence.p00Passed,false);
});
test('Exactly eight nonempty profiles can pass; invalid, missing and seventh profiles cannot',()=>{
  const plan=buildP00Plan(reviewed());let captures=capturesFor(plan);
  for(const id of ['T09','T10'])captures.find(c=>c.id===id).response.results.entities=[];
  assert.equal(replayP00(plan,captures).state,'passed');captures.find(c=>c.id==='T08').response.results.entities=[];assert.equal(replayP00(plan,captures).state,'failed');
  captures=capturesFor(plan);captures.find(c=>c.id==='T10').response=null;assert.equal(replayP00(plan,captures).allResponsesValid,false);
  assert.equal(replayP00(plan,capturesFor(plan).filter(c=>c.id!=='T10')).state,'failed');
});
test('Replay rejects wrong parameters, outside-shelf and duplicate identities',()=>{
  const plan=buildP00Plan(reviewed());
  for(const alter of [c=>c.params.take=50,c=>c.path='/search',c=>c.method='POST',c=>c.response.results.entities=[{entity_id:uuid(900)}],c=>c.response.results.entities.push({...c.response.results.entities[0],entity_id:c.response.results.entities[0].entity_id.toUpperCase()})]){
    const captures=capturesFor(plan);alter(captures[0]);const report=replayP00(plan,captures);assert.equal(report.state,'failed');assert.equal(report.checks[0].state,'failed');assert.equal(report.controlsPassed,false);
  }
});
test('Exclusion capture is derived from the actual first result and cannot retain it',()=>{
  const plan=buildP00Plan(reviewed()),captures=capturesFor(plan);const first=plan.requests[0].candidateWorkKeys[0];
  captures.at(-1).response.results.entities=[{entity_id:plan.mapping[first]}];assert.equal(replayP00(plan,captures).checks.at(-1).code,'source_contract');
  captures[0].response.results.entities=[];assert.equal(replayP00(plan,captures).checks.at(-1).state,'blocked');
  assert.throws(()=>exclusionRequest(plan,plan.requests[1].candidateWorkKeys[0]));
});
test('Unknown, repeated and oversized capture batches are rejected',()=>{
  const plan=buildP00Plan(reviewed()),captures=capturesFor(plan);
  assert.throws(()=>replayP00(plan,[...captures,captures[0]]));assert.throws(()=>replayP00(plan,[{id:'unknown'}]));assert.throws(()=>replayP00(plan,[null]));assert.throws(()=>replayP00(buildP00Plan(template()),[]));
});
test('Replay output retains no response prose, secret-like extras or affinity scores',()=>{
  const plan=buildP00Plan(reviewed()),captures=capturesFor(plan);for(const c of captures){c.extra='SECRET';c.response.message='SECRET';c.response.results.entities[0].affinity=0.987654;}
  const text=JSON.stringify(replayP00(plan,captures));assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('0.987654'));assert.ok(!text.includes('entity_id'));
});
test('Preflight rejects abbreviated, stale, modified and inconsistent operator evidence',()=>{
  const plan=buildP00Plan(reviewed()),report=operatorEvidence(replayP00(plan,capturesFor(plan)));
  assert.equal(p00EvidenceMatches(report,plan),true);assert.equal(readinessReport({mapping:plan.mapping,p00:report,p00Plan:plan}).evidence.p00Passed,true);
  assert.equal(readinessReport({p00:{state:'passed',source:'qloo',catalogVersion},mapping:plan.mapping}).evidence.p00Passed,false);
  for(const alter of [r=>r.planFingerprint='old',r=>r.nonemptyProfiles=8,r=>r.checks[0].returnedWorkKeys.push('outside'),r=>r.checks[1]=r.checks[0],r=>r.checks[0].state='empty',r=>{r.checks[1].id='unknown';r.checks[1].kind=undefined;},r=>r.checks.at(-1).returnedWorkKeys=[r.checks[0].returnedWorkKeys[0]]]){
    const bad=structuredClone(report);alter(bad);assert.equal(p00EvidenceMatches(bad,plan),false);
  }
  const mapping={...plan.mapping,ocean:uuid(999)};assert.equal(readinessReport({mapping,p00:report,p00Plan:plan}).evidence.p00Passed,false);
});
test('Shared search contract rejects blank names, wrong types and duplicate UUIDs',()=>{
  const entity={entity_id:uuid(1),name:'Amélie',types:['urn:entity:movie']};assert.equal(parseQlooSearch({results:[entity]},'movie')[0].id,uuid(1));
  for(const results of [[{...entity,name:' '}],[{...entity,types:['urn:entity:book']}],[entity,{...entity,entity_id:entity.entity_id.toUpperCase()}],[null]])assert.throws(()=>parseQlooSearch({results},'movie'),{code:'source_contract'});
  assert.throws(()=>parseQlooSearch({success:false,results:[]},'movie'),{code:'source_contract'});
});

test('Search preserves author disambiguation so homonymous books can be confirmed correctly',()=>{
  const results=[
    {entity_id:uuid(1),name:'Never Let Me Go',types:['urn:entity:book'],disambiguation:'2005, Kazuo Ishiguro'},
    {entity_id:uuid(2),name:'Never Let Me Go',types:['urn:entity:book'],disambiguation:'2002, Doug Fowler'}
  ];
  const matches=parseQlooSearch({results},'book');
  assert.equal(matches[0].detail,'2005, Kazuo Ishiguro');
  assert.equal(matches[1].detail,'2002, Doug Fowler');
  assert.equal(parseQlooSearch({results:[{...results[0],disambiguation:' ',properties:{publication_year:2005}}]},'book')[0].detail,'2005');
});
test('Production Qloo uses the replay ranking parser and rejects duplicates before returning',async()=>{
  const candidates=[catalog[0]],mapping={piranesi:uuid(1)};const data={results:{entities:[{entity_id:uuid(1)},{entity_id:uuid(1).toUpperCase()}]}};
  assert.throws(()=>parseQlooRanking(data,candidates,mapping),{code:'source_contract'});
  const provider=new QlooProvider({key:'test',approved:true,mapping,budget:{reserve(){}},fetchImpl:async()=>Response.json(data)});
  await assert.rejects(provider.rank(candidates,[{id:uuid(100)}]),{code:'source_contract'});
});
test('P00 planning reports unresolved review without calls and rejects unknown commands',()=>{
  const child=spawnSync(process.execPath,['scripts/qloo-p00.mjs','plan','data/qloo-review.example.json'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,QLOO_API_KEY:'SECRET_SENTINEL'}});
  assert.equal(child.status,1);assert.equal(JSON.parse(child.stdout).state,'blocked');assert.ok(!child.stdout.includes('SECRET_SENTINEL'));assert.equal(child.stderr,'');
  const unsupported=spawnSync(process.execPath,['scripts/qloo-p00.mjs','unexpected','data/qloo-review.example.json'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(unsupported.status,1);assert.match(unsupported.stderr,/Use:/);
});
test('P00 collection stops after the first invalid response and records missing controls',async()=>{
  const plan=buildP00Plan(reviewed());let calls=0;
  const report=await collectP00(plan,async()=>{calls++;return {results:{entities:[{entity_id:uuid(9999)}]}};},{transport:'mock'});
  assert.equal(calls,1);assert.equal(report.state,'failed');assert.equal(report.liveQlooVerified,false);assert.equal(report.failureCode,'source_contract');assert.equal(report.checks.find(c=>c.id==='T10').state,'missing');
});
test('P00 collection uses thirteen bounded requests with an actual dependent exclusion',async()=>{
  const plan=buildP00Plan(reviewed());let calls=0;
  const report=await collectP00(plan,async(path,params)=>{calls++;assert.equal(path,'/v2/insights');return {results:{entities:params['filter.results.entities'].split(',').slice(0,3).map(entity_id=>({entity_id}))}};},{transport:'mock'});
  assert.equal(calls,13);assert.equal(report.state,'passed');assert.equal(report.requestsCompleted,13);assert.equal(report.failureCode,null);
});
test('Dependent control uses the first actual response, not the first planned candidate',()=>{
  const plan=buildP00Plan(reviewed());const request=plan.requests[0];const second=request.candidateWorkKeys[1];const captures=[capture(plan,request,[second])];
  const control=deriveExclusionRequest(plan,captures);assert.equal(control.request.excludedWorkKey,second);assert.ok(control.request.candidateWorkKeys.includes(request.candidateWorkKeys[0]));assert.equal(control.liveQlooVerified,false);
  captures[0].params.take=99;assert.throws(()=>deriveExclusionRequest(plan,captures));assert.throws(()=>deriveExclusionRequest(plan,[]));
});
test('CLI can save a complete offline plan, dependent control and replay without approving live',()=>{
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-p00-'));const review=reviewed();const plan=buildP00Plan(review);const captures=capturesFor(plan);
  const outputs=['plan','exclude','replay'].map(command=>new URL(`../test-results/qloo-p00-${command}.json`,import.meta.url));
  const original=outputs.map(path=>existsSync(path)?readFileSync(path):null);
  try {
    const reviewFile=join(dir,'review.json'),captureFile=join(dir,'captures.json');writeFileSync(reviewFile,JSON.stringify(review));writeFileSync(captureFile,JSON.stringify(captures));
    for(const command of ['plan','exclude','replay']){
      const child=spawnSync(process.execPath,['scripts/qloo-p00.mjs',command,reviewFile,...(command==='plan'?[]:[captureFile])],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).liveQlooVerified,false);
      const output=JSON.parse(readFileSync(new URL(`../test-results/qloo-p00-${command}.json`,import.meta.url),'utf8'));assert.equal(output.liveQlooVerified,false);assert.equal(output.source,command==='replay'?'offline_replay':'offline_plan');
    }
  }finally{for(const [i,path]of outputs.entries())if(original[i]===null)rmSync(path,{force:true});else writeFileSync(path,original[i]);rmSync(dir,{recursive:true});}
});
