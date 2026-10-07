import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {FixtureProvider} from '../src/providers.mjs';
async function harness(t,options={}){const server=createApp(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;return {base,client(){let cookie;return async(path,body,extra={})=>{const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,data:res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text(),headers:res.headers};};}};}
async function seeded(client){await client('/api/bootstrap');const a=await client('/api/search?query=Am%C3%A9lie&type=movie');const b=await client('/api/search?query=AURORA&type=artist');return {budgetMinor:2500,tasteIds:[a.data.results[0].id,b.data.results[0].id],unavailableWorkKey:'priory'};}
test('HTTP end-to-end search → confirmed decision → exclusion → gift card',async t=>{
  const h=await harness(t),c=h.client(),brief=await seeded(c);const first=await c('/api/decide',brief);assert.equal(first.status,200);assert.equal(first.data.decision.state,'ready');const old=first.data.decision.cards[0];const next=await c('/api/refine',{kind:'exclude',workKey:old.workKey,version:1,decisionId:first.data.decision.id});assert.equal(next.status,200);assert.ok(next.data.decision.cards.every(c=>c.workKey!==old.workKey));const selected=next.data.decision.cards[0];const gift=await c('/api/gift-card',{sku:selected.sku,version:2,decisionId:next.data.decision.id});assert.equal(gift.status,200);assert.equal(gift.data.note,selected.note);assert.equal(gift.data.reason,selected.reason);assert.ok(gift.data.giftNote.length>0);assert.ok(gift.data.text.includes(gift.data.giftNote));assert.ok(gift.data.text.includes(selected.note));assert.ok(!gift.data.text.includes(selected.reason));assert.match(gift.data.text,/simulated/);assert.match(gift.data.text,/No purchase/);
});
test('Sessions cannot borrow confirmed IDs, decisions or gift cards',async t=>{
  const h=await harness(t),a=h.client(),b=h.client();const brief=await seeded(a);await a('/api/decide',brief);assert.equal((await b('/api/decide',brief)).status,400);assert.equal((await b('/api/decision')).data.decision,null);assert.equal((await b('/api/gift-card',{sku:'SB-piranesi-P',version:1})).status,409);
});
test('Concurrent mutation is rejected and failed refinement leaves previous decision intact',async t=>{
  let unlock;let block=false;const fixture=new FixtureProvider();const provider={source:'fixture',search:(...a)=>fixture.search(...a),rank:async(...a)=>{if(block)await new Promise(r=>unlock=r);return fixture.rank(...a);}};
  const h=await harness(t,{provider}),c=h.client(),brief=await seeded(c);const first=(await c('/api/decide',brief)).data.decision;block=true;const waiting=c('/api/refine',{kind:'budget',budgetMinor:1800,version:1,decisionId:first.id});while(!unlock)await new Promise(r=>setTimeout(r,5));assert.equal((await c('/api/refine',{kind:'budget',budgetMinor:1500,version:1,decisionId:first.id})).status,409);unlock();await waiting;const stale=await c('/api/refine',{kind:'budget',budgetMinor:1200,version:1,decisionId:first.id});assert.equal(stale.status,409);assert.equal((await c('/api/decision')).data.decision.version,2);
});
test('Server blocks CSRF, traversal, oversized JSON and exposes no source files',async t=>{
  const h=await harness(t),c=h.client();assert.equal((await c('/api/decide',{}, {Origin:'https://evil.example'})).status,403);assert.equal((await c('/api/decide',{payload:'x'.repeat(13000)})).status,413);for(const path of ['/src/server.mjs','/.env','/../package.json'])assert.equal((await c(path)).status,404);const html=await c('/');assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);assert.match(html.data,/ShelfBridge/);
});
test('Session capacity is bounded',async t=>{const h=await harness(t,{maxSessions:1});assert.equal((await h.client()('/api/bootstrap')).status,200);assert.equal((await h.client()('/api/bootstrap')).status,503);});
test('Provider outage does not overwrite the previous successful decision',async t=>{
  let broken=false;const fixture=new FixtureProvider();const provider={source:'fixture',search:(...a)=>fixture.search(...a),rank:async(...a)=>{if(broken)throw Object.assign(Error('Source unavailable'),{status:503,code:'source_unavailable'});return fixture.rank(...a);}};
  const h=await harness(t,{provider}),c=h.client(),brief=await seeded(c);const first=(await c('/api/decide',brief)).data.decision;broken=true;const error=await c('/api/refine',{kind:'budget',budgetMinor:1800,version:1,decisionId:first.id});assert.equal(error.status,503);const current=(await c('/api/decision')).data.decision;assert.equal(current.id,first.id);assert.equal(current.version,1);
});
test('Different briefs at version 1 cannot reuse each other’s decision capability',async t=>{
  const h=await harness(t),c=h.client(),brief=await seeded(c);const first=(await c('/api/decide',brief)).data.decision;const second=(await c('/api/decide',brief)).data.decision;assert.equal(first.version,second.version);assert.notEqual(first.id,second.id);
  assert.equal((await c('/api/refine',{kind:'exclude',workKey:second.cards[0].workKey,version:1,decisionId:first.id})).status,409);
  assert.equal((await c('/api/gift-card',{sku:second.cards[0].sku,version:1,decisionId:first.id})).status,409);
  assert.equal((await c('/api/gift-card',{sku:second.cards[0].sku,version:1,decisionId:second.id})).status,200);
});

test('Unknown API routes and wrong methods do not allocate sessions',async t=>{
  const h=await harness(t,{maxSessions:1});
  const unknown=await h.client()('/api/unknown');assert.equal(unknown.status,404);assert.equal(unknown.headers.get('set-cookie'),null);
  const wrong=await h.client()('/api/decide');assert.equal(wrong.status,405);assert.equal(wrong.headers.get('allow'),'POST');assert.equal(wrong.headers.get('set-cookie'),null);
  assert.equal((await h.client()('/api/bootstrap')).status,200);
});

test('Cross-site and sibling-site GET requests cannot spend search calls or create sessions',async t=>{
  let searches=0;const fixture=new FixtureProvider();
  const h=await harness(t,{maxSessions:1,provider:{source:'fixture',search:(...args)=>{searches++;return fixture.search(...args);}}});
  for(const headers of [{Origin:'https://evil.example'},{Origin:'null'},{Origin:'malformed'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}]){
    const response=await h.client()('/api/search?query=Amelie&type=movie',undefined,headers);
    assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);
  }
  assert.equal(searches,0);assert.equal((await h.client()('/api/search?query=Amelie&type=movie',undefined,{Origin:h.base,'Sec-Fetch-Site':'same-origin'})).status,200);assert.equal(searches,1);
});

test('Invalid searches do not consume valid search allowances',async t=>{
  const h=await harness(t),c=h.client();
  for(let i=0;i<21;i++)assert.equal((await c('/api/search?query=&type=unknown')).status,400);
  for(let i=0;i<20;i++)assert.equal((await c('/api/search?query=Amelie&type=movie')).status,200);
  assert.equal((await c('/api/search?query=Amelie&type=movie')).status,429);
});

test('Expired sessions lose their confirmed tastes and decisions at the expiry boundary',async t=>{
  let clock=1000;const h=await harness(t,{now:()=>clock,maxSessions:1}),c=h.client(),brief=await seeded(c);
  await c('/api/decide',brief);clock+=30*60*1000;
  assert.equal((await c('/api/decision')).data.decision,null);assert.equal((await c('/api/decide',brief)).status,400);
  assert.equal((await c('/api/decide',await seeded(c))).status,200);
});

test('JSON-like media types are rejected before creating a session',async t=>{
  const h=await harness(t,{maxSessions:1});
  const bad=await h.client()('/api/decide',{}, {'Content-Type':'application/jsonp'});
  assert.equal(bad.status,415);assert.equal(bad.headers.get('set-cookie'),null);
  assert.equal((await h.client()('/api/bootstrap')).status,200);
});

test('Timed-out searches do not confirm late identities',async t=>{
  let unlock,receivedSignal;const fixture=new FixtureProvider();
  const h=await harness(t,{searchTimeoutMs:50,provider:{source:'fixture',search:async(query,type,signal)=>{receivedSignal=signal;await new Promise(r=>unlock=r);return fixture.search(query,type);}}}),c=h.client();
  const result=await c('/api/search?query=Amelie&type=movie');assert.equal(result.status,504);assert.equal(result.data.code,'search_timeout');assert.equal(receivedSignal.aborted,true);
  unlock();await new Promise(r=>setImmediate(r));
  assert.equal((await c('/api/decide',{budgetMinor:2500,tasteIds:['fixture:movie:amelie']})).status,400);
});

test('Timed-out refinements release the session and never commit late results',async t=>{
  let blocked=false,unlock,receivedSignal;const fixture=new FixtureProvider();
  const provider={source:'fixture',search:(...args)=>fixture.search(...args),rank:async(candidates,tastes,primary,signal)=>{if(blocked){receivedSignal=signal;await new Promise(r=>unlock=r);}return fixture.rank(candidates,tastes,primary);}};
  const h=await harness(t,{provider,decisionTimeoutMs:50}),c=h.client(),brief=await seeded(c);const first=(await c('/api/decide',brief)).data.decision;blocked=true;
  const result=await c('/api/refine',{kind:'budget',budgetMinor:1500,version:1,decisionId:first.id});assert.equal(result.status,504);assert.equal(result.data.code,'decision_timeout');assert.equal(receivedSignal.aborted,true);
  assert.equal((await c('/api/decision')).data.decision.id,first.id);
  blocked=false;const next=await c('/api/decide',brief);assert.equal(next.status,200);
  unlock();await new Promise(r=>setImmediate(r));assert.equal((await c('/api/decision')).data.decision.id,next.data.decision.id);
});
