import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {QlooCliProvider,cliArguments,runCli,configuredQlooProvider} from '../src/qloo-cli.mjs';
import {catalog} from '../src/catalog.mjs';
const id='abcdefab-1234-1234-1234-000000000001';
const runtimeCheck=()=>({ready:true});

test('CLI awaits the shared reservation and never starts after a rejected or cancelled reservation',async()=>{
  let runs=0,release;const reserving=new Promise(resolve=>{release=resolve;});
  const provider=new QlooCliProvider({key:'test',runtimeCheck,budget:{reserve:()=>reserving},runner:async()=>{runs++;return [];}});
  const waiting=provider.search('Piranesi','book');await Promise.resolve();assert.equal(runs,0);
  release();await waiting;assert.equal(runs,1);
  provider.budget.reserve=async()=>{throw Object.assign(Error('quota'),{status:429,code:'budget_limited'});};
  await assert.rejects(provider.search('Piranesi','book'),{code:'budget_limited'});assert.equal(runs,1);
  const controller=new AbortController();provider.budget.reserve=async()=>controller.abort();
  await assert.rejects(provider.search('Piranesi','book',controller.signal));assert.equal(runs,1);
});

test('CLI deadline is bounded and still cancels a stalled Qloo-only request',async()=>{
  for(const requestTimeoutMs of [0,20001,NaN,1.5])assert.throws(()=>new QlooCliProvider({requestTimeoutMs}),/deadline/);
  let calls=0,seenSignal;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),100);
  const provider=new QlooCliProvider({key:'test',requestTimeoutMs:25,runtimeCheck,budget:{reserve(){calls++;}},runner:({signal})=>{seenSignal=signal;return new Promise(()=>{});}});
  try{await assert.rejects(provider.search('Piranesi','book',controller.signal),{code:'source_unavailable'});assert.equal(calls,1);assert.equal(seenSignal.aborted,true);}finally{clearTimeout(timer);}
  assert.equal(new QlooCliProvider({requestTimeoutMs:18000}).requestTimeoutMs,18000);assert.equal(new QlooCliProvider({}).requestTimeoutMs,7000);
});
test('CLI passes only exact confirmed IDs and shelf params; the key is absent from arguments',async()=>{
  let calls=0;const seen=[];
  const provider=new QlooCliProvider({env:{OPENAI_API_KEY:'other-secret'},key:'qloo-secret',mapping:{piranesi:id},approved:true,budget:{reserve(){calls++;}},runtimeCheck,runner:async input=>{seen.push(input);return [{entity_id:id}];}});
  const result=await provider.rank([catalog[0]],[{id}]);assert.equal(result.rows[0].workKey,'piranesi');assert.equal(calls,1);
  assert.ok(!JSON.stringify(seen[0].args).includes('qloo-secret'));const params=JSON.parse(seen[0].args[seen[0].args.indexOf('--params')+1]);assert.equal(params['filter.results.entities'],id);assert.equal(params['signal.interests.entities'],id);assert.ok(!seen[0].args.includes('--signal-query'));
});
test('CLI contract rejects envelope, outside shelf, duplicates and incomplete runtime without substitution',async()=>{
  for(const response of [{results:[]},[{entity_id:id},{entity_id:id.toUpperCase()}],[{entity_id:'abcdefab-1234-1234-1234-000000000002'}]]){
    const provider=new QlooCliProvider({key:'test',mapping:{piranesi:id},approved:true,budget:{reserve(){}},runtimeCheck,runner:async()=>response});
    await assert.rejects(provider.rank([catalog[0]],[{id}]),{code:'source_contract'});
  }
  let calls=0;const blocked=new QlooCliProvider({key:'test',budget:{reserve(){calls++;}},runtimeCheck:()=>({ready:false}),runner:()=>{throw Error('must not run');}});
  await assert.rejects(blocked.search('Piranesi','book'),{code:'source_unavailable'});assert.equal(calls,0);
});
test('Missing credentials and already cancelled CLI searches spend no budget',async()=>{
  for(const key of ['', ' ', '<placeholder>']){
    const provider=new QlooCliProvider({key,budget:{reserve(){throw Error('must not reserve');}},runtimeCheck});await assert.rejects(provider.search('book','book'),{code:'source_unavailable'});
  }
  const controller=new AbortController();controller.abort();const provider=new QlooCliProvider({key:'test',runtimeCheck,budget:{reserve(){throw Error('must not reserve');}}});await assert.rejects(provider.search('Piranesi','book',controller.signal));
  assert.throws(()=>cliArguments('/arbitrary',{}));assert.throws(()=>configuredQlooProvider({env:{QLOO_TRANSPORT:'arbitrary'}}));
});
function helper(t,source) {
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-cli-'));const entry=join(dir,'helper.mjs');writeFileSync(entry,source);t.after(()=>rmSync(dir,{recursive:true}));return {node:process.execPath,entry,home:join(dir,'private'),args:[]};
}
test('CLI child receives only its provider environment and runs without a shell',async t=>{
  const config=helper(t,"console.log(JSON.stringify({hasQloo:Boolean(process.env.QLOO_API_KEY),hasOther:Boolean(process.env.OPENAI_API_KEY),hasCloud:Boolean(process.env.AWS_SECRET_ACCESS_KEY),hasHome:Boolean(process.env.QLOO_HOME),args:process.argv.slice(2)}));");
  const data=await runCli({...config,args:['a; echo wrong','$(wrong)'],env:{...process.env,QLOO_API_KEY:'qloo-test',OPENAI_API_KEY:'other-test',AWS_SECRET_ACCESS_KEY:'cloud-test'},signal:AbortSignal.timeout(2000)});
  assert.equal(data.hasQloo,true);assert.equal(data.hasOther,false);assert.equal(data.hasCloud,false);assert.equal(data.hasHome,true);assert.deepEqual(data.args,['a; echo wrong','$(wrong)']);
});
test('CLI deadlines kill stalled children and output limits stop excessive output',async t=>{
  const stalled=helper(t,"setInterval(()=>{},1000);");const controller=new AbortController();const waiting=runCli({...stalled,signal:controller.signal});controller.abort(Object.assign(Error('deadline'),{status:504,code:'deadline'}));await assert.rejects(waiting,{code:'deadline'});
  const excess=helper(t,"process.stdout.write('x'.repeat(20000));setInterval(()=>{},1000);");await assert.rejects(runCli({...excess,maxBytes:1000,signal:AbortSignal.timeout(2000)}),{code:'source_contract'});
});
test('CLI failures expose controlled messages without raw provider prose or key',async t=>{
  const failed=helper(t,"console.log(JSON.stringify({error:true,code:'AUTH_FAILED',message:'RAW_SECRET'}));process.exitCode=1;");
  await assert.rejects(runCli({...failed,signal:AbortSignal.timeout(2000)}),error=>error.code==='source_unavailable'&&!error.message.includes('RAW_SECRET'));
  const malformed=helper(t,"console.log('RAW_SECRET');");await assert.rejects(runCli({...malformed,signal:AbortSignal.timeout(2000)}),error=>error.code==='source_contract'&&!error.message.includes('RAW_SECRET'));
});
test('CLI preload blocks redirects and large upstream bodies before JSON buffering',async t=>{
  let redirected=0;const server=createServer((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(302,{Location:'/target'});res.end();return;}
    if(req.url==='/target'){redirected++;res.end('{}');return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({large:'x'.repeat(1000100)}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const config=helper(t,"try{const r=await fetch(process.argv[2]);await r.json();console.log('[]');}catch{console.log(JSON.stringify({error:true,code:'GUARD_FAILURE'}));process.exitCode=1;}");
  for(const path of ['/redirect','/large'])await assert.rejects(runCli({...config,args:[`http://127.0.0.1:${server.address().port}${path}`],signal:AbortSignal.timeout(3000)}),{code:'source_unavailable'});
  assert.equal(redirected,0);
});
