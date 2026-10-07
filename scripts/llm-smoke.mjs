// At most three planner calls; the shelf-ranking source remains explicitly fixture.
import {Planner,decide} from '../src/agent.mjs';
import {FixtureProvider} from '../src/providers.mjs';
import {fixtureTastes} from '../src/catalog.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {hasKey} from '../src/readiness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));const runtime=join(root,'.runtime');const model=process.env.OPENAI_MODEL||'gpt-4.1-mini';
let report;
try {
  if(!hasKey(process.env.OPENAI_API_KEY))throw Object.assign(Error('OpenAI key missing'),{code:'planner_key_missing'});
  report=await withRuntimeLock(runtime,'llm-smoke',async()=>{
    const budget=new DailyBudget(runtime,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));let calls=0;
    const reservation={reserve(provider){const reserved=budget.reserve(provider);calls++;return reserved;}};
    try {
      const planner=new Planner({key:process.env.OPENAI_API_KEY,model,budget:reservation,enabled:true});
      const tastes=fixtureTastes.slice(0,2);const request={budgetMinor:2500,tasteIds:tastes.map(t=>t.id),unavailableWorkKey:'priory',primaryTasteId:null,excludedWorkKeys:[],version:1};
      const result=await decide({request,tastes,provider:new FixtureProvider(),planner,signal:AbortSignal.timeout(20000)});
      return {state:'passed',model,agent:result.agent,rankingSource:result.source,tools:result.trace.map(t=>({actor:t.actor,tool:t.tool,strategy:t.strategy})),durationMs:result.durationMs,providerCallsReserved:calls,liveQlooVerified:false};
    }catch(error){return {state:'not_verified',model,code:error.code||'network_or_provider_error',providerStatus:error.providerStatus||null,providerCode:error.providerCode||null,providerType:error.providerType||null,failureKind:error.failureKind||null,retryAfterSeconds:error.retryAfterSeconds??null,providerCallsReserved:calls,liveQlooVerified:false};}
  });
}catch(error){report={state:'blocked',model,code:error.code||'local_setup_error',providerCallsReserved:0,liveQlooVerified:false};}
report.checkedAt=new Date().toISOString();
mkdirSync(join(root,'test-results'),{recursive:true});
// An unavailable local runtime must not overwrite an earlier live attempt's evidence.
const name=report.state==='blocked'?'llm-smoke-blocked.json':'llm-smoke.json';
writeFileSync(join(root,'test-results',name),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(report.state!=='passed')process.exitCode=1;
