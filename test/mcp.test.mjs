import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createApp} from '../src/server.mjs';
import {FixtureProvider} from '../src/providers.mjs';
import {ShelfBridgeTools,localBase} from '../scripts/mcp-tools.mjs';
import {serveMcp,protocolVersion} from '../scripts/mcp-server.mjs';

async function harness(t,options={}) {
  let calls=0;const fixture=new FixtureProvider();
  const provider={source:'fixture',search:(...a)=>{calls++;return fixture.search(...a);},rank:(...a)=>{calls++;return fixture.rank(...a);}};
  const app=createApp({provider,...options});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
  const base=`http://127.0.0.1:${app.address().port}`;
  return {base,bridge:new ShelfBridgeTools({base,allowFixture:true}),calls:()=>calls};
}
async function inspect(bridge,extra={}) {
  const a=await bridge.call('search_tastes',{query:'Amélie',type:'movie'});
  const b=await bridge.call('search_tastes',{query:'AURORA',type:'artist'});
  return bridge.call('inspect_shelf',{tasteIds:[a.results[0].id,b.results[0].id],budgetMinor:2500,unavailableWorkKey:'priory',userConfirmed:true,...extra});
}
test('MCP workflow enforces inspect, constraints, two repairs and current gift without extra calls',async t=>{
  const h=await harness(t),b=h.bridge;
  await assert.rejects(b.call('find_alternatives',{briefId:'invented'}),{code:'brief_required'});assert.equal(h.calls(),0);
  const shelf=await inspect(b);assert.equal(h.calls(),2);assert.ok(shelf.eligibleEditions.every(e=>e.workKey!=='priory'&&e.priceMinor<=2500&&e.stockCount>0));
  const first=(await b.call('find_alternatives',{briefId:shelf.briefId})).decision;assert.equal(first.cards.length,3);assert.equal(h.calls(),3);
  await assert.rejects(b.call('find_alternatives',{briefId:shelf.briefId}),{code:'brief_required'});assert.equal(h.calls(),3);
  const second=(await b.call('refine_selection',{kind:'exclude',workKey:first.cards[0].workKey,decisionId:first.id,version:1,userConfirmed:true})).decision;
  assert.ok(second.cards.every(c=>c.workKey!==first.cards[0].workKey));
  const third=(await b.call('refine_selection',{kind:'budget',budgetMinor:1500,decisionId:second.id,version:2,userConfirmed:true})).decision;
  assert.ok(third.cards.every(c=>c.priceMinor<=1500));
  const gift=await b.call('gift_card',{sku:third.cards[0].sku,decisionId:third.id,version:3,userConfirmed:true});assert.match(gift.text,/simulated/);assert.match(gift.text,/No purchase/);assert.equal(h.calls(),5);
  await assert.rejects(b.call('refine_selection',{kind:'budget',budgetMinor:1400,decisionId:third.id,version:3,userConfirmed:true}),{code:'refinement_limit'});assert.equal(h.calls(),5);
});
test('MCP rejects unconfirmed, forged and extra arguments before provider calls',async t=>{
  const h=await harness(t),b=h.bridge;
  for(const args of [{tasteIds:['forged'],budgetMinor:2500,userConfirmed:true},{tasteIds:['forged'],budgetMinor:2500,userConfirmed:false},{tasteIds:['forged'],budgetMinor:2500,userConfirmed:true,stockCount:1}])await assert.rejects(b.call('inspect_shelf',args));
  for(const args of [{query:'x',type:'movie',url:'https://bad.invalid'},{query:'x',type:'person'},{query:' '.repeat(3),type:'movie'}])await assert.rejects(b.call('search_tastes',args));
  await assert.rejects(b.call('refine_selection',{kind:'budget',budgetMinor:1000,workKey:'piranesi',decisionId:'x',version:1,userConfirmed:true}));assert.equal(h.calls(),0);
});
test('MCP session identity and decision capabilities cannot be borrowed',async t=>{
  const h=await harness(t),b=h.bridge,shelf=await inspect(b),other=new ShelfBridgeTools({base:h.base,allowFixture:true});
  await assert.rejects(other.call('inspect_shelf',{tasteIds:shelf.tastes.map(t=>t.id),budgetMinor:2500,userConfirmed:true}),{code:'taste_confirmation_required'});
  const d=(await b.call('find_alternatives',{briefId:shelf.briefId})).decision;
  await assert.rejects(other.call('gift_card',{sku:d.cards[0].sku,decisionId:d.id,version:d.version,userConfirmed:true}),{code:'version_conflict'});
  await assert.rejects(b.call('gift_card',{sku:d.cards[0].sku,decisionId:d.id,version:9,userConfirmed:true}),{code:'version_conflict'});assert.equal(h.calls(),3);
});
test('MCP explicitly distinguishes offline mode and restricts base URLs',async t=>{
  const h=await harness(t);
  await assert.rejects(new ShelfBridgeTools({base:h.base}).call('shelf_status'),{code:'bridge_mode'});
  for(const base of ['http://localhost:4318','http://127.1:4318','http://2130706433:4318','http://127.0.0.1:4318/api','https://127.0.0.1:4318','http://127.0.0.1:4318?x=1','http://user:pw@127.0.0.1:4318','http://example.com:4318'])assert.throws(()=>localBase(base));
  assert.equal(localBase('http://127.0.0.1:4318/'),'http://127.0.0.1:4318');assert.equal(h.calls(),0);
});
test('MCP no-stock uses zero ranking calls, and expiry clears old confirmed identities',async t=>{
  let now=1;const h=await harness(t,{now:()=>now}),b=h.bridge;
  const shelf=await inspect(b,{budgetMinor:100});const d=(await b.call('find_alternatives',{briefId:shelf.briefId})).decision;assert.equal(d.state,'no_eligible_stock');assert.equal(h.calls(),2);
  now+=30*60*1000;
  await assert.rejects(b.call('inspect_shelf',{tasteIds:shelf.tastes.map(t=>t.id),budgetMinor:2500,userConfirmed:true}),{code:'session_expired'});
  await assert.rejects(b.call('inspect_shelf',{tasteIds:shelf.tastes.map(t=>t.id),budgetMinor:2500,userConfirmed:true}),{code:'taste_confirmation_required'});assert.equal(h.calls(),2);
});
test('MCP failed rebuild preserves the previous selection and failed briefs cannot retry',async t=>{
  let broken=false,calls=0;const f=new FixtureProvider();
  const h=await harness(t,{provider:{source:'fixture',search:(...a)=>f.search(...a),rank:(...a)=>{calls++;if(broken)throw Object.assign(Error('Source unavailable'),{status:503,code:'source_unavailable'});return f.rank(...a);}}}),b=h.bridge;
  const shelf=await inspect(b),d=(await b.call('find_alternatives',{briefId:shelf.briefId})).decision;broken=true;
  await assert.rejects(b.call('refine_selection',{kind:'budget',budgetMinor:1500,decisionId:d.id,version:1,userConfirmed:true}),{code:'source_unavailable'});
  const gift=await b.call('gift_card',{sku:d.cards[0].sku,decisionId:d.id,version:1,userConfirmed:true});assert.equal(gift.sku,d.cards[0].sku);
  const next=await b.call('inspect_shelf',{tasteIds:shelf.tastes.map(t=>t.id),budgetMinor:2500,userConfirmed:true});
  await assert.rejects(b.call('find_alternatives',{briefId:next.briefId}),{code:'source_unavailable'});
  await assert.rejects(b.call('find_alternatives',{briefId:next.briefId}),{code:'brief_required'});assert.equal(calls,3);
});
function wire(t,bridge={call:async()=>({ok:true})},options={}) {
  const input=new PassThrough(),output=new PassThrough();const responses=[];let buffer='';
  output.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\n'))!==-1){responses.push(JSON.parse(buffer.slice(0,index)));buffer=buffer.slice(index+1);}});
  const server=serveMcp({input,output,bridge,...options});t.after(()=>server.close());
  const send=(id,method,params)=>input.write(JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,...(params===undefined?{}:{params})})+'\n');
  const take=async()=>{for(let i=0;i<100&&!responses.length;i++)await new Promise(r=>setTimeout(r,5));assert.ok(responses.length,'JSON-RPC response');return responses.shift();};
  const init=async()=>{send(1,'initialize',{protocolVersion,capabilities:{},clientInfo:{name:'test-client',version:'1'}});await take();send(undefined,'notifications/initialized');};
  return {input,output,responses,send,take,init};
}
test('MCP stdio requires handshake and lists six schema-constrained tools',async t=>{
  const w=wire(t);w.send(0,'tools/list');assert.equal((await w.take()).error.code,-32000);
  w.send(1,'initialize',{protocolVersion:'future-version',capabilities:{},clientInfo:{name:'test',version:'1'}});const init=await w.take();assert.equal(init.result.protocolVersion,protocolVersion);assert.equal(init.result.capabilities.tools.listChanged,false);
  w.send(undefined,'notifications/initialized');w.send(2,'tools/list');const list=(await w.take()).result.tools;assert.equal(list.length,6);assert.ok(list.every(t=>t.inputSchema.additionalProperties===false));
  w.send(3,'tools/call',{name:'unknown',arguments:{}});assert.equal((await w.take()).error.code,-32602);
  w.send(4,'tools/call',{name:'shelf_status',arguments:{}});const result=(await w.take()).result;assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);assert.equal(result.isError,false);
});
test('MCP stdio framing handles split lines, malformed JSON, oversized messages and notifications',async t=>{
  const w=wire(t,undefined,{maxMessageBytes:256});w.input.write('{bad}\n');assert.equal((await w.take()).error.code,-32700);
  w.input.write('{"jsonrpc":"2.0","id":1,');w.input.write('"method":"ping"}\n');assert.deepEqual((await w.take()).result,{});
  w.send(undefined,'unrecognized/notification');assert.equal(w.responses.length,0);
  w.input.write('x'.repeat(257));assert.equal((await w.take()).error.code,-32600);assert.equal(w.output.writableEnded,true);
});
test('MCP cancellation aborts work and emits no late success or error',async t=>{
  let received;const w=wire(t,{call:async(name,args,signal)=>{received=signal;await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return {late:true};}});await w.init();
  w.send(2,'tools/call',{name:'shelf_status',arguments:{}});assert.ok(received);w.send(undefined,'notifications/cancelled',{requestId:2});assert.equal(received.aborted,true);await new Promise(r=>setImmediate(r));assert.equal(w.responses.length,0);
});
test('MCP prevents concurrent session tools without spending a duplicate provider call',async t=>{
  const h=await harness(t),b=h.bridge;let release;const fetchImpl=b.fetchImpl;b.fetchImpl=async(...args)=>{await new Promise(r=>release=r);return fetchImpl(...args);};
  const pending=b.call('shelf_status');await assert.rejects(b.call('search_tastes',{query:'Amélie',type:'movie'}),{code:'bridge_busy'});release();await pending;assert.equal(h.calls(),0);
});
