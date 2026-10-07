import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {readProviderJson} from '../src/http.mjs';
import {QlooProvider} from '../src/providers.mjs';
import {Planner} from '../src/agent.mjs';
import {catalog} from '../src/catalog.mjs';

test('Streaming response limits count UTF-8 bytes and cancel before reading the whole body',async()=>{
  let pulled=0,cancelled=false;
  const body=new ReadableStream({pull(controller){pulled++;controller.enqueue(new TextEncoder().encode('ї'.repeat(20)));},cancel(){cancelled=true;}});
  await assert.rejects(readProviderJson(new Response(body),{label:'Test',code:'source_contract',maxBytes:50}),{status:502,code:'source_contract'});
  assert.equal(cancelled,true);assert.ok(pulled<=3);
});

test('Oversized declared bodies are cancelled and valid chunked JSON is parsed',async()=>{
  let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(readProviderJson(new Response(body,{headers:{'Content-Length':'1000001'}}),{label:'Test',code:'source_contract'}),/contract limit/);assert.equal(cancelled,true);
  const good=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"results":'));controller.enqueue(new TextEncoder().encode('[]}'));controller.close();}});
  assert.deepEqual(await readProviderJson(new Response(good),{label:'Test',code:'source_contract'}),{results:[]});
});

test('Unreadable provider JSON reports a contract error',async()=>{
  await assert.rejects(readProviderJson(new Response('{'),{label:'Test',code:'source_contract'}),{status:502,code:'source_contract'});
});

test('Both providers stop stalled response bodies, preserve reservations and report controlled errors',async()=>{
  for(const kind of ['qloo','openai']){
    let reserved=0,cancelled=false;
    const budget={reserve(){reserved++;}};
    const fetchImpl=async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}));
    const controller=new AbortController();
    const operation=kind==='qloo'?new QlooProvider({key:'test',budget,fetchImpl}).search('Amelie','movie',controller.signal):new Planner({key:'test',enabled:true,budget,fetchImpl}).run({},()=>({}),()=>{},controller.signal,[]);
    const rejection=assert.rejects(operation,{status:503,code:kind==='qloo'?'source_unavailable':'planner_unavailable'});
    await delay(10);controller.abort();await rejection;assert.equal(reserved,1);assert.equal(cancelled,true);
  }
});

test('Both providers reject oversized real streaming responses without executing tools',async()=>{
  for(const kind of ['qloo','openai']){
    let toolCalls=0;const budget={reserve(){}};const fetchImpl=async()=>new Response('x'.repeat(1000001));
    const operation=kind==='qloo'?new QlooProvider({key:'test',budget,fetchImpl}).search('Amelie','movie'):new Planner({key:'test',enabled:true,budget,fetchImpl}).run({},()=>{toolCalls++;},()=>{toolCalls++;},undefined,[]);
    await assert.rejects(operation,{status:502,code:kind==='qloo'?'source_contract':'planner_contract'});assert.equal(toolCalls,0);
  }
});

test('Already cancelled provider requests do not reserve calls or contact the network',async()=>{
  for(const kind of ['qloo','openai']){
    let called=0;const budget={reserve(){called++;}};const fetchImpl=async()=>{called++;return Response.json({});};
    const signal=AbortSignal.abort();
    const operation=kind==='qloo'?new QlooProvider({key:'test',budget,fetchImpl}).search('Amelie','movie',signal):new Planner({key:'test',enabled:true,budget,fetchImpl}).run({},()=>{},()=>{},signal,[]);
    await assert.rejects(operation);assert.equal(called,0);
  }
});

test('Null Qloo payloads and null entities report contract errors for search and ranking',async()=>{
  const id='11111111-1111-1111-1111-111111111111';
  for(const data of [null,{results:[null]},{results:{entities:[null]}}]){
    const provider=new QlooProvider({key:'test',budget:{reserve(){}},approved:true,mapping:{piranesi:id},fetchImpl:async()=>Response.json(data)});
    await assert.rejects(provider.search('Amelie','movie'),{status:502,code:'source_contract'});
    await assert.rejects(provider.rank([catalog[0]],[{id}],null),{status:502,code:'source_contract'});
  }
});

test('Malformed planner payloads and missing call IDs fail before executing tools',async()=>{
  for(const data of [null,{output:[null]},{output:[{type:'function_call',name:'inspect_shelf',arguments:'{}'}]}]){
    let tools=0;const planner=new Planner({key:'test',enabled:true,budget:{reserve(){}},fetchImpl:async()=>Response.json(data)});
    await assert.rejects(planner.run({},()=>{tools++;},()=>{tools++;},undefined,[]),{status:502,code:'planner_contract'});assert.equal(tools,0);
  }
});
