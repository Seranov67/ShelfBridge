import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkUnits} from '../src/benchmark.mjs';
import {newCollection,inspectCollection,collectBenchmark,benchmarkExecutor} from '../src/benchmark-collector.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {configuredQlooProvider,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {readinessReport} from '../src/readiness.mjs';
import {buildP00Plan} from '../src/p00.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'test-results','benchmark'),runtime=join(root,'.runtime');
function read(path){if(statSync(path).size>2_000_000)throw Error('Bounded input required');return JSON.parse(readFileSync(path,'utf8'));}
function optional(path){return existsSync(path)?read(path):null;}
function save(name,value){mkdirSync(out,{recursive:true});const path=join(out,name);writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(path+'.tmp',path);}
function options(args){
  const result={live:false,maxUnits:8,maxCalls:12};const seen=new Set();
  for(const arg of args){
    const [name,value]=arg.split('=');
    if(seen.has(name)||arg.split('=').length>2)throw Error('Duplicate flag');seen.add(name);
    if(['--live','--dry-run'].includes(name)&&value===undefined)result.live=name==='--live';
    else if(['--max-units','--max-calls'].includes(name)&&/^\d+$/.test(value||''))result[name==='--max-units'?'maxUnits':'maxCalls']=Number(value);
    else throw Error('Unknown flag');
  }
  if(seen.has('--live')&&seen.has('--dry-run')||result.maxUnits<1||result.maxUnits>154||result.maxCalls<1||result.maxCalls>60)throw Error('Invalid batch bounds');
  return result;
}

let live=false,calls=0;
try{
  const opts=options(process.argv.slice(2));live=opts.live;
  const plan=read(join(out,'plan.json'));
  const journalPath=join(out,'collection.json');
  const load=()=>{
    const journal=optional(journalPath)||newCollection(plan);inspectCollection(plan,journal);
    // The journal is authoritative. Refuse to silently adopt or overwrite an
    // independently imported captures file, which could otherwise cause retries.
    const exported=optional(join(out,'captures.json'));
    if(exported&&( !Array.isArray(exported)||exported.some(c=>!journal.captures.some(saved=>JSON.stringify(saved)===JSON.stringify(c)))))throw Error('Captures conflict with journal');
    return journal;
  };
  const review=read(join(root,'data','qloo-review.json')),mapping=read(join(root,'data','qloo-mapping.json'));
  const p00Plan=buildP00Plan(review);
  const readiness=readinessReport({mapping,p00Plan,p00:optional(join(root,'test-results','p00.json')),plannerSmoke:optional(join(root,'test-results','llm-smoke.json')),transportCheck:inspectCliRuntime()});
  const blockers=[...Object.entries(readiness.checks),...Object.entries(readiness.evidence).filter(([name])=>name!=='realEndToEndPassed')].filter(([,passed])=>!passed).map(([name])=>name);
  if(JSON.stringify(plan.mapping)!==JSON.stringify(Object.fromEntries(Object.entries(mapping).map(([k,id])=>[k,id.toLowerCase()]).sort(([a],[b])=>a<b?-1:a>b?1:0))))blockers.push('frozenMappingMismatch');
  if(plan.model!==(process.env.OPENAI_MODEL||'gpt-4.1-mini'))blockers.push('frozenModelMismatch');
  const journal=load(),units=benchmarkUnits(plan).filter(u=>u.method!=='B0');
  if(!live){
    console.log(JSON.stringify({state:'dry_run',providerCallsReserved:0,completed:journal.captures.length,pending:journal.pending?.id||null,missing:units.length-journal.captures.length,maxUnits:opts.maxUnits,maxCalls:opts.maxCalls,blockers,qualityBenchmark:false}));
  }else{
    if(blockers.length){console.log(JSON.stringify({state:'blocked',blockers,providerCallsReserved:0}));process.exitCode=1;}
    else{
      const report=await withRuntimeLock(runtime,'benchmark-collection',async()=>{
        const current=load(),daily=new DailyBudget(runtime,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));
        const budget={remaining:()=>daily.remaining(),reserve(provider){daily.reserve(provider);calls++;}};
        const persist=value=>{save('collection.json',value);save('captures.json',value.captures);};
        return collectBenchmark({plan,journal:current,budget,persist,maxUnits:opts.maxUnits,maxCalls:opts.maxCalls,
          execute:benchmarkExecutor({plan,key:process.env.OPENAI_API_KEY,providerFactory:reservation=>configuredQlooProvider({mapping:plan.mapping,budget:reservation,approved:true})})});
      });
      save('collection-report.json',report);console.log(JSON.stringify(report));
      if(['provider_failure','interrupted'].includes(report.reason))process.exitCode=1;
    }
  }
}catch(error){
  const code=['runtime_locked','budget_limited','benchmark_contract'].includes(error?.code)?error.code:'collection_setup_error';
  console.error(JSON.stringify({state:'blocked',code,liveRequested:live,providerCallsReserved:calls,instructions:'Check the frozen plan, bounded flags, existing collection journal and current live prerequisites. Archive completed experiments before preparing another plan.'}));process.exitCode=1;
}
