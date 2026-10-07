import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEvidenceMatches,currentLiveCodeFingerprint} from '../src/live-evidence.mjs';
const binding={model:'gpt-4.1-mini',planFingerprint:'current-plan',codeFingerprint:currentLiveCodeFingerprint(),tasteIds:['confirmed-one','confirmed-two']};
function report(){
  const checks=['bootstrap','confirmed_searches','initial_decision','confirmed_exclusion','lower_budget','gift_card','session_restore','no_stock_no_calls'].map(id=>({id,state:'passed'}));
  checks.find(c=>c.id==='confirmed_searches').tasteIds=binding.tasteIds;
  for(const [i,id]of ['initial_decision','confirmed_exclusion','lower_budget'].entries())Object.assign(checks.find(c=>c.id===id),{hardConstraintViolations:[],workKeys:i?['bookshop']:['piranesi'],version:i+1,budgetMinor:i===2?1500:2500});
  return {state:'passed',source:'live_qloo_openai_http',liveEndToEndVerified:true,liveQlooVerified:true,...binding,providerCallsReserved:8,checks};
}
test('Complete current journey evidence is required; mock, stale and abbreviated reports cannot unlock live mode',()=>{
  assert.equal(liveEvidenceMatches(report(),binding),true);
  for(const patch of [{source:'fixture'},{source:'mock'},{codeFingerprint:'stale'},{planFingerprint:'stale'},{model:'different'},{liveEndToEndVerified:false},{providerCallsReserved:0},{providerCallsReserved:15},{checks:[]}])assert.equal(liveEvidenceMatches({...report(),...patch},binding),false);
  const duplicate=report();duplicate.checks[1]=duplicate.checks[0];assert.equal(liveEvidenceMatches(duplicate,binding),false);
  const violated=report();violated.checks.find(c=>c.id==='initial_decision').hardConstraintViolations=['ineligible_work'];assert.equal(liveEvidenceMatches(violated,binding),false);
  const retained=report();retained.checks.find(c=>c.id==='confirmed_exclusion').workKeys=['piranesi'];assert.equal(liveEvidenceMatches(retained,binding),false);
  const overspent=report();overspent.checks.find(c=>c.id==='lower_budget').workKeys=['dune'];assert.equal(liveEvidenceMatches(overspent,binding),false);
  assert.equal(liveEvidenceMatches(report(),{...binding,tasteIds:['other']}),false);
  assert.equal(liveEvidenceMatches(report(),{...binding,codeFingerprint:null}),false);
});
