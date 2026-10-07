import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {checkLiveJourney} from '../src/live-journey.mjs';
const tastes=[{query:'Amélie',type:'movie',id:'abcdefab-1234-1234-1234-000000000001'},{query:'Aurora Aksnes',type:'artist',id:'abcdefab-1234-1234-1234-000000000002'}];
async function setup(t,source='qloo') {
  let calls=0;
  const provider={source,async search(query){calls++;return tastes.filter(t=>t.query===query).map(t=>({...t,name:t.query}));},async rank(candidates){calls++;return {rows:candidates.map(c=>({workKey:c.workKey})),queriedAt:new Date().toISOString(),warning:'Controlled test provider',omitted:[]};}};
  const planner={enabled:true,async run(context,inspect,rank,signal,trace){calls++;trace.push({actor:'llm',tool:'inspect_shelf',result:inspect()});return rank('all_confirmed','llm');}};
  const app=createApp({mode:'live',provider,planner});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
  return {base:`http://127.0.0.1:${app.address().port}`,reservations:()=>calls};
}
test('Live journey checker exercises the HTTP session, exclusion, budget, gift and zero-call empty shelf',async t=>{
  const config=await setup(t);const checks=await checkLiveJourney({...config,tastes});
  assert.equal(checks.length,8);assert.ok(checks.every(c=>c.state==='passed'));
  const initial=checks.find(c=>c.id==='initial_decision');const excluded=checks.find(c=>c.id==='confirmed_exclusion');
  assert.ok(!excluded.workKeys.includes(initial.workKeys[0]));assert.equal(checks.find(c=>c.id==='lower_budget').budgetMinor,1500);
  assert.equal(config.reservations(),8);assert.ok(!Object.hasOwn(checks,'liveQlooVerified'));
});
test('Live journey checker rejects fixture substitution even when the HTTP response succeeds',async t=>{
  const config=await setup(t,'fixture');await assert.rejects(checkLiveJourney({...config,tastes}),{code:'live_source_mismatch'});
  assert.equal(config.reservations(),1);
});
