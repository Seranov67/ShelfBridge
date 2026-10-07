import {createHash} from 'node:crypto';
import {catalog,catalogVersion,eligibleEditions} from './catalog.mjs';
import {compileReview} from './review.mjs';
import {parseQlooRanking} from './qloo-contract.mjs';
import {fail} from './policy.mjs';

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));

function request(id,kind,candidates,tasteIds,mapping) {
  return {id,kind,method:'GET',path:'/v2/insights',candidateWorkKeys:candidates.map(e=>e.workKey),tasteIds,
    params:{'filter.type':'urn:entity:book','signal.interests.entities':tasteIds.join(','),'filter.results.entities':candidates.map(e=>mapping[e.workKey]).join(','),take:Math.min(50,candidates.length)}};
}

// No credentials, network access, provider calls, or contract approval here.
export function buildP00Plan(review) {
  const compiled=compileReview(review);
  const blockers=[];
  if(!compiled.coverage.coverageTargetMet)blockers.push('mapping_coverage_below_24');
  if(compiled.coverage.missingEligibleWorks.length)blockers.push('eligible_books_unmapped');
  if(compiled.reviewedProfiles!==10)blockers.push('ten_reviewed_profiles_required');
  const base={schemaVersion:1,catalogVersion,state:blockers.length?'blocked':'planned',source:'offline_plan',liveQlooVerified:false,blockers,coverage:compiled.coverage,reviewedProfiles:compiled.reviewedProfiles,maxRankingRequests:13};
  if(blockers.length)return {...base,requests:[],exclusionControl:null,fingerprint:null};
  const mapping=sorted(compiled.mapping);const profiles=compiled.profiles.toSorted((a,b)=>a.task.localeCompare(b.task));
  const shelf=eligibleEditions({budgetMinor:100000,excludedWorkKeys:[],unavailableWorkKey:null});
  const a=shelf.filter((_,i)=>i%2===0),b=shelf.filter((_,i)=>i%2===1);
  const signals=profiles[0].tasteIds;
  const requests=[request('shelf-a','disjoint_shelf',a,signals,mapping),request('shelf-b','disjoint_shelf',b,signals,mapping),
    ...profiles.map(profile=>request(profile.task,'taste_profile',eligibleEditions({...profile,excludedWorkKeys:[]}),profile.tasteIds,mapping))];
  const exclusionControl={id:'exclude-first',dependsOn:'shelf-a',rule:'Remove the first returned work from shelf-a; keep the same taste signals.'};
  const binding=fingerprint({catalog,mapping,profiles,requests,exclusionControl});
  return {...base,mapping,requests,exclusionControl,fingerprint:binding};
}

export function exclusionRequest(plan,firstWorkKey) {
  const initial=plan.requests.find(r=>r.id==='shelf-a');
  if(!initial?.candidateWorkKeys.includes(firstWorkKey))throw fail('Exclusion needs the first result of shelf-a.');
  const remaining=new Set(initial.candidateWorkKeys.filter(key=>key!==firstWorkKey));
  const candidates=eligibleEditions({budgetMinor:100000,excludedWorkKeys:[],unavailableWorkKey:null}).filter(e=>remaining.has(e.workKey));
  return {...request('exclude-first','exclusion',candidates,initial.tasteIds,plan.mapping),excludedWorkKey:firstWorkKey};
}

const equalParams=(a,b)=>a&&b&&JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
function checkCapture(plan,request,capture) {
  if(!capture)return {id:request.id,kind:request.kind,state:'missing',code:'capture_missing',returnedWorkKeys:[]};
  if(capture.method!==request.method||capture.path!==request.path||!equalParams(capture.params,request.params))return {id:request.id,kind:request.kind,state:'failed',code:'request_mismatch',returnedWorkKeys:[]};
  try {
    const candidates=request.candidateWorkKeys.map(key=>catalog.find(e=>e.workKey===key));
    const rows=parseQlooRanking(capture.response,candidates,plan.mapping);
    return {id:request.id,kind:request.kind,state:rows.length?'passed':'empty',code:null,returnedWorkKeys:rows.map(r=>r.workKey),omittedWorkKeys:request.candidateWorkKeys.filter(key=>!rows.some(row=>row.workKey===key))};
  }catch{return {id:request.id,kind:request.kind,state:'failed',code:'source_contract',returnedWorkKeys:[]};}
}

function validateCaptures(plan,captures) {
  if(plan.state!=='planned')throw fail('Complete the manually reviewed books and ten profiles before P00 replay.');
  if(!Array.isArray(captures)||captures.length>13||captures.some(c=>!c||typeof c.id!=='string')||new Set(captures.map(c=>c.id)).size!==captures.length)throw fail('Expected at most thirteen distinct captures.');
  const allowed=new Set([...plan.requests.map(r=>r.id),'exclude-first']);
  if(captures.some(c=>!allowed.has(c.id)))throw fail('Unknown P00 capture.');
}

export function deriveExclusionRequest(plan,captures) {
  validateCaptures(plan,captures);
  const initial=plan.requests.find(r=>r.id==='shelf-a');
  const checked=checkCapture(plan,initial,captures.find(c=>c.id==='shelf-a'));
  if(checked.state!=='passed')throw fail('Provide a valid nonempty shelf-a capture with matching request parameters.');
  return {schemaVersion:1,state:'planned',source:'offline_plan',liveQlooVerified:false,planFingerprint:plan.fingerprint,request:exclusionRequest(plan,checked.returnedWorkKeys[0])};
}

// Replaying local files checks the adapter. It cannot prove where the files came from.
export function replayP00(plan,captures) {
  validateCaptures(plan,captures);
  const checks=plan.requests.map(r=>checkCapture(plan,r,captures.find(c=>c.id===r.id)));
  const first=checks.find(c=>c.id==='shelf-a');
  const exclusion=first.state==='passed'?checkCapture(plan,exclusionRequest(plan,first.returnedWorkKeys[0]),captures.find(c=>c.id==='exclude-first')):{id:'exclude-first',kind:'exclusion',state:'blocked',code:'shelf_a_nonempty_required',returnedWorkKeys:[]};
  checks.push(exclusion);
  const nonemptyProfiles=checks.filter(c=>c.kind==='taste_profile'&&c.state==='passed').length;
  const controlsPassed=checks.filter(c=>c.kind!=='taste_profile').every(c=>c.state==='passed');
  const allResponsesValid=checks.every(c=>['passed','empty'].includes(c.state));
  return {schemaVersion:1,checkedAt:new Date().toISOString(),catalogVersion,planFingerprint:plan.fingerprint,source:'offline_replay',state:controlsPassed&&allResponsesValid&&nonemptyProfiles>=8?'passed':'failed',liveQlooVerified:false,contractApproved:false,controlsPassed,allResponsesValid,nonemptyProfiles,profileDenominator:10,capturesChecked:checks.length,checks};
}

// The caller supplies a bounded transport. Stop on the first contract/transport
// failure rather than spending the rest of the planned calls after a bad response.
export async function collectP00(plan,get,{signal,transport}={}) {
  validateCaptures(plan,[]);const captures=[];let failureCode=null;
  const save=async request=>{
    signal?.throwIfAborted();
    const response=await get(request.path,request.params,signal);
    const capture={id:request.id,method:request.method,path:request.path,params:request.params,response};
    const check=checkCapture(plan,request,capture);captures.push(capture);
    if(!['passed','empty'].includes(check.state))throw fail('P00 response contract failed.',502,'source_contract');
  };
  try {
    for(const request of plan.requests) {
      await save(request);
      if(request.id==='shelf-a') {
        const checked=checkCapture(plan,request,captures.at(-1));
        if(checked.state!=='passed')throw fail('P00 needs a nonempty shelf control.',502,'p00_empty_control');
        await save(exclusionRequest(plan,checked.returnedWorkKeys[0]));
      }
      if(request.id==='shelf-b'&&!captures.at(-1).response.results.entities.length)throw fail('P00 needs a nonempty shelf control.',502,'p00_empty_control');
    }
  }catch(error){failureCode=['source_contract','source_unavailable','budget_limited','p00_empty_control'].includes(error.code)?error.code:'p00_cancelled_or_failed';}
  const report=replayP00(plan,captures);
  const live=transport==='cli';
  return {...report,source:live?'qloo':'mock',transport,state:failureCode?'failed':report.state,liveQlooVerified:live&&!failureCode&&report.state==='passed',failureCode,requestsCompleted:captures.length};
}

// Local reports are operator evidence, not signed attestations. Reject abbreviated,
// stale, fixture, and offline reports rather than trusting only state="passed".
export function p00EvidenceMatches(report,plan) {
  if(!report||plan?.state!=='planned'||report.schemaVersion!==1||report.state!=='passed'||report.source!=='qloo'||report.transport!=='cli'||report.liveQlooVerified!==true||report.catalogVersion!==catalogVersion||report.planFingerprint!==plan.fingerprint||report.profileDenominator!==10||report.capturesChecked!==13||report.controlsPassed!==true||report.allResponsesValid!==true||!Array.isArray(report.checks)||report.checks.length!==13)return false;
  const expected=new Map([...plan.requests.map(r=>[r.id,r.kind]),['exclude-first','exclusion']]);const ids=new Set();let profiles=0;
  for(const check of report.checks) {
    if(!check||!expected.has(check.id)||ids.has(check.id)||expected.get(check.id)!==check.kind||!['passed','empty'].includes(check.state)||check.code!==null||!Array.isArray(check.returnedWorkKeys)||new Set(check.returnedWorkKeys).size!==check.returnedWorkKeys.length||check.returnedWorkKeys.length>50)return false;
    ids.add(check.id);
    if((check.state==='passed')!==Boolean(check.returnedWorkKeys.length))return false;
    const request=check.id==='exclude-first'?null:plan.requests.find(r=>r.id===check.id);
    if(request&&check.returnedWorkKeys.some(key=>!request.candidateWorkKeys.includes(key)))return false;
    if(check.kind==='taste_profile'){if(check.state==='passed')profiles++;}else if(check.state!=='passed')return false;
  }
  const first=report.checks.find(c=>c.id==='shelf-a');
  const exclusion=report.checks.find(c=>c.id==='exclude-first');
  const remaining=exclusionRequest(plan,first.returnedWorkKeys[0]).candidateWorkKeys;
  return exclusion.returnedWorkKeys.every(key=>remaining.includes(key))&&profiles>=8&&report.nonemptyProfiles===profiles;
}
