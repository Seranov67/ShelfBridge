import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {catalog,eligibleEditions,fixtureTastes} from '../src/catalog.mjs';
import {validateRequest,refine,assertRanking} from '../src/policy.mjs';
import {FixtureProvider,QlooProvider,validateMapping} from '../src/providers.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {Planner,decide} from '../src/agent.mjs';
const tastes=new Map(fixtureTastes.map(t=>[t.id,t]));const works=new Set(catalog.map(e=>e.workKey));
const brief=()=>validateRequest({budgetMinor:2500,tasteIds:fixtureTastes.slice(0,2).map(t=>t.id),unavailableWorkKey:'priory'},tastes,works);
const cycle=(request,extra={})=>decide({request,tastes:request.tasteIds.map(id=>tastes.get(id)),provider:new FixtureProvider(),planner:new Planner({enabled:false}),...extra});

test('Every eligible edition respects stock, integer budget, exclusion and currency',()=>{
  for(const budgetMinor of [100,1100,1300,1500,1800,2500,100000]) {
    const r={...brief(),budgetMinor,excludedWorkKeys:['piranesi','ocean']};const results=eligibleEditions(r);
    assert.equal(new Set(results.map(e=>e.workKey)).size,results.length);
    for(const e of results){assert.ok(e.stockCount>0);assert.ok(e.priceMinor<=budgetMinor);assert.equal(e.currency,'USD');assert.ok(!['piranesi','ocean','priory'].includes(e.workKey));}
  }
});
test('Cheapest eligible edition is used; work exclusion removes every edition',()=>{
  assert.equal(eligibleEditions({...brief(),budgetMinor:4000}).find(e=>e.workKey==='piranesi').sku,'SB-piranesi-P');
  assert.ok(!eligibleEditions({...brief(),excludedWorkKeys:['piranesi']}).some(e=>e.workKey==='piranesi'));
});
test('Unknown price, stock, stock timestamp and currency are ineligible',()=>{
  const original=catalog[0];for(const patch of [{priceMinor:null},{priceMinor:NaN},{stockCount:null},{stockCount:-1},{stockAsOf:null},{currency:'EUR'}])assert.equal(eligibleEditions(brief(),[{...original,...patch}]).length,0);
});
test('Unconfirmed or fabricated tastes, invalid budgets and primary changes are rejected',()=>{
  for(const patch of [{tasteIds:['fake']},{tasteIds:[]},{tasteIds:[fixtureTastes[0].id,fixtureTastes[0].id]},{budgetMinor:2499.99},{budgetMinor:0},{primaryTasteId:'fake'},{unavailableWorkKey:'fake'}])assert.throws(()=>validateRequest({...brief(),...patch},tastes,works));
});
test('Unavailable giver choice is never inserted into recipient taste signals',()=>assert.deepEqual(brief().tasteIds,fixtureTastes.slice(0,2).map(t=>t.id)));
test('No eligible shelf returns an honest state without invoking a provider',async()=>{
  const r=await cycle({...brief(),budgetMinor:100},{provider:{source:'qloo',rank(){throw Error('Must not call');}}});assert.equal(r.state,'no_eligible_stock');assert.equal(r.cards.length,0);assert.equal(r.budgetMinor,100);
});
test('A rejected title causes a new ranking, new evidence and explicit before/after',async()=>{
  const request=brief();const first=await cycle(request);const next=refine(request,{kind:'exclude',version:1,workKey:first.cards[0].workKey},first.cards,0);const second=await cycle(next,{previous:first});
  assert.ok(second.cards.every(c=>c.workKey!==first.cards[0].workKey));assert.notEqual(second.evidence.id,first.evidence.id);assert.equal(second.version,2);assert.ok(second.diff.removed.includes(first.cards[0].title));assert.equal(second.source,'fixture');
});
test('Lower budget and removed tastes are applied, not just changed in prose',async()=>{
  const request=brief();const first=await cycle(request);const next=refine(request,{kind:'budget',budgetMinor:1500,version:1},first.cards,0);const second=await cycle(next);assert.ok(second.cards.every(c=>c.priceMinor<=1500));
  const third=refine(next,{kind:'remove_taste',tasteId:next.tasteIds[0],version:2},second.cards,1);const last=await cycle(third);assert.deepEqual(last.evidence.signalIds,third.tasteIds);
});
test('Stale versions, arbitrary rejections, increased budget and excessive refinement fail',async()=>{
  const r=brief(),cards=(await cycle(r)).cards;for(const [body,count]of [[{kind:'exclude',workKey:cards[0].workKey,version:0},0],[{kind:'exclude',workKey:'fake',version:1},0],[{kind:'budget',budgetMinor:2600,version:1},0],[{kind:'budget',budgetMinor:1800,version:1},2]])assert.throws(()=>refine(r,body,cards,count));
});
test('Out-of-shelf and duplicate ranking responses fail closed',()=>{
  assert.throws(()=>assertRanking([{workKey:'fake'}],catalog));assert.throws(()=>assertRanking([{workKey:'piranesi'},{workKey:'piranesi'}],catalog));
});
test('Cards only contain exact catalog facts and traceable evidence references',async()=>{
  const d=await cycle(brief());for(const c of d.cards){const e=catalog.find(x=>x.sku===c.sku);for(const key of ['title','author','priceMinor','stockCount','format','stockAsOf'])assert.equal(c[key],e[key]);assert.equal(c.evidenceRef,d.evidence.id);}assert.equal(d.agent,'deterministic');
});
test('Durable daily reservations survive restart and failed calls remain charged',()=>{
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-'));try{new DailyBudget(dir,2).reserve('qloo');new DailyBudget(dir,2).reserve('openai');assert.throws(()=>new DailyBudget(dir,2).reserve('qloo'),/limit/);writeFileSync(join(dir,'budget.json'),'invalid');assert.throws(()=>new DailyBudget(dir,2).reserve('qloo'),/ledger/);}finally{rmSync(dir,{recursive:true});}
});
test('LLM tool loop executes inspect then rank, and passes the actual tool result',async()=>{
  let calls=0;const bodies=[];const planner=new Planner({key:'test-key',enabled:true,budget:{reserve(){}},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);bodies.push(body);calls++;assert.equal(options.redirect,'error');return Response.json({output:[{type:'function_call',name:calls===1?'inspect_shelf':'rank_shelf',arguments:calls===1?'{}':'{"strategy":"all_confirmed"}',call_id:`call-${calls}`} ]});}});
  const d=await cycle(brief(),{planner});assert.equal(d.agent,'llm_tool_loop');assert.equal(calls,2);assert.equal(bodies[1].input.at(-1).type,'function_call_output');assert.equal(d.trace.length,2);assert.ok(d.trace.every(t=>t.actor==='llm'));assert.equal(d.source,'fixture');
});
test('Planner cannot switch to an unconfirmed primary taste or call arbitrary tools',async()=>{
  for(const action of [{name:'rank_shelf',arguments:'{"strategy":"primary_confirmed"}'},{name:'fetch_url',arguments:'{"url":"https://evil.example"}'}]){
    let n=0;const planner=new Planner({key:'test-key',enabled:true,budget:{reserve(){}},fetchImpl:async()=>Response.json({output:[{type:'function_call',...(++n===1?{name:'inspect_shelf',arguments:'{}'}:action),call_id:'test'}]})});await assert.rejects(cycle(brief(),{planner}),/unconfirmed|invalid action/);
  }
});
test('Provider failures are not silently substituted with fixtures',async()=>{
  await assert.rejects(cycle(brief(),{provider:{source:'qloo',rank:async()=>{throw Error('Outage');}}}),/Outage/);
});
test('Qloo adapter constructs only whitelisted GET params with the key in a header',async()=>{
  const id='11111111-1111-1111-1111-111111111111';let received;const p=new QlooProvider({key:'test-key',approved:true,mapping:{piranesi:id},budget:{reserve(){}},fetchImpl:async(url,opts)=>{received={url,opts};return {ok:true,text:async()=>JSON.stringify({results:{entities:[{entity_id:id}]}})};}});
  const result=await p.rank([catalog[0]],[{id:'22222222-2222-2222-2222-222222222222'}],null);assert.equal(result.rows[0].workKey,'piranesi');assert.equal(received.url.searchParams.get('filter.results.entities'),id);assert.equal(received.opts.headers['X-Api-Key'],'test-key');assert.ok(!received.url.toString().includes('test-key'));assert.equal(received.opts.redirect,'error');
});
test('Qloo authentication is not retried and malformed/outside response is rejected',async()=>{
  const id='11111111-1111-1111-1111-111111111111';let calls=0;const make=fetchImpl=>new QlooProvider({key:'test-key',approved:true,mapping:{piranesi:id},budget:{reserve(){}},fetchImpl});
  const bad=make(async()=>{calls++;return {ok:false,status:401};});await assert.rejects(bad.rank([catalog[0]],[{id}],null),/authentication/);assert.equal(calls,1);
  for(const data of [{results:[]},{results:{entities:[{entity_id:'22222222-2222-2222-2222-222222222222'}]}}])await assert.rejects(make(async()=>({ok:true,text:async()=>JSON.stringify(data)})).rank([catalog[0]],[{id}],null),/contract|outside/);
});
test('Unverified live mapping cannot be enabled by fixture data',async()=>{
  assert.throws(()=>validateMapping({piranesi:'fixture:piranesi'}));await assert.rejects(new QlooProvider({key:'test-key'}).rank([catalog[0]],[],null),/verification/);
});
test('Teaching search supports book works and accent-insensitive identity lookup',async()=>{
  const p=new FixtureProvider();assert.equal((await p.search('Amelie','movie'))[0].name,'Amélie');const book=(await p.search('Earthsea','book'))[0];assert.equal(book.detail,'Ursula K. Le Guin');assert.match(book.id,/^fixture:book:/);
});
test('Live feasibility fails before spending LLM calls; missing LLM key never becomes agent success',async()=>{
  const provider=new QlooProvider({key:'test-key',approved:false});let called=false;
  await assert.rejects(cycle(brief(),{provider,planner:{run(){called=true;}}}),/verification/);assert.equal(called,false);
  await assert.rejects(cycle(brief(),{planner:new Planner({enabled:true})}),/not configured/);
});
