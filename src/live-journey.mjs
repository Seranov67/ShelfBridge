import {hardConstraintViolations} from './evaluation.mjs';
import {fail} from './policy.mjs';

// Exercise the real HTTP session and policy boundaries. This helper alone never
// attests a live provider; the caller owns transport and evidence provenance.
export async function checkLiveJourney({base,tastes,reservations=()=>0,execution='llm'}) {
  if(!['llm','deterministic'].includes(execution))throw fail('Unknown live execution mode.',400,'live_source_mismatch');
  const mode=execution==='llm'?'live':'qloo_only',actor=execution==='llm'?'llm':'deterministic',agent=execution==='llm'?'llm_tool_loop':'deterministic';
  let cookie='';const checks=[];
  async function api(path,body) {
    const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});
    cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;
    const data=await response.json();
    if(!response.ok)throw fail('Live HTTP check failed.',response.status,typeof data.code==='string'?data.code:'live_http_failed');
    return data;
  }
  const bootstrap=await api('/api/bootstrap');
  if(bootstrap.mode!==mode||bootstrap.agent!==actor)throw fail('Live check execution mode does not match.',502,'live_source_mismatch');
  checks.push({id:'bootstrap',state:'passed'});
  for(const taste of tastes) {
    const data=await api(`/api/search?query=${encodeURIComponent(taste.query)}&type=${taste.type}`);
    if(data.source!=='qloo')throw fail('Live search used an unexpected source.',502,'live_source_mismatch');
    if(!data.results.some(t=>t.id===taste.id&&t.type===taste.type))throw fail('The reviewed taste was not returned by search.',502,'live_identity_missing');
  }
  checks.push({id:'confirmed_searches',state:'passed',tasteIds:tastes.map(t=>t.id)});
  let brief={budgetMinor:2500,tasteIds:tastes.map(t=>t.id),unavailableWorkKey:'priory',excludedWorkKeys:[]};
  function verify(decision,id) {
    const violations=hardConstraintViolations(decision,brief);
    const ranked=decision.trace?.find(t=>t.tool==='rank_shelf');
    if(decision.source!=='qloo'||decision.agent!==agent||decision.state!=='ready'||ranked?.actor!==actor||ranked.strategy!=='all_confirmed'||!decision.trace.some(t=>t.tool==='inspect_shelf'&&t.actor===actor))throw fail('Live decision execution does not match.',502,'live_source_mismatch');
    if(violations.length||decision.evidence?.source!=='qloo'||JSON.stringify([...decision.evidence.signalIds].sort())!==JSON.stringify([...brief.tasteIds].sort()))throw fail('Live constraints or confirmed signals changed.',502,'live_constraint_failed');
    checks.push({id,state:'passed',version:decision.version,budgetMinor:decision.budgetMinor,workKeys:decision.cards.map(c=>c.workKey),hardConstraintViolations:violations});
  }
  let result=await api('/api/decide',{...brief,primaryTasteId:null});
  let decision=result.decision;verify(decision,'initial_decision');
  const excluded=decision.cards[0].workKey;
  result=await api('/api/refine',{kind:'exclude',workKey:excluded,version:decision.version,decisionId:decision.id});
  brief={...brief,excludedWorkKeys:[excluded]};decision=result.decision;verify(decision,'confirmed_exclusion');
  result=await api('/api/refine',{kind:'budget',budgetMinor:1500,version:decision.version,decisionId:decision.id});
  brief={...brief,budgetMinor:1500};decision=result.decision;verify(decision,'lower_budget');
  if(result.refinementsLeft!==0)throw fail('Live refinement limit did not hold.',502,'live_constraint_failed');
  const card=decision.cards[0];
  const gift=await api('/api/gift-card',{sku:card.sku,version:decision.version,decisionId:decision.id});
  if(gift.source!=='qloo'||gift.sku!==card.sku||gift.title!==card.title||gift.priceMinor!==card.priceMinor||gift.inventory!=='simulated'||gift.note!==card.note||gift.reason!==card.reason||typeof gift.giftNote!=='string'||!gift.giftNote||typeof gift.text!=='string'||!gift.text.includes(gift.giftNote)||!gift.text.includes(card.note)||gift.text.includes(card.reason))throw fail('Gift did not match the current live selection.',502,'live_constraint_failed');
  checks.push({id:'gift_card',state:'passed',workKey:card.workKey});
  const restored=await api('/api/bootstrap');
  if(restored.lastDecision?.id!==decision.id||restored.refinementsLeft!==0)throw fail('Live session did not preserve the selection.',502,'live_session_failed');
  checks.push({id:'session_restore',state:'passed'});
  const callsBefore=reservations();
  const empty=await api('/api/decide',{budgetMinor:100,tasteIds:brief.tasteIds,unavailableWorkKey:'priory',primaryTasteId:null});
  if(empty.decision.state!=='no_eligible_stock'||empty.decision.cards.length||reservations()!==callsBefore)throw fail('Empty stock spent provider calls.',502,'live_constraint_failed');
  checks.push({id:'no_stock_no_calls',state:'passed'});
  return checks;
}
