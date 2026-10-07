// Exactly five Qloo attempts on success: two searches and three decisions.
// This evidence cannot activate the separate OpenAI/Qloo live mode.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
import {Planner} from '../src/agent.mjs';
import {configuredQlooProvider,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {buildP00Plan} from '../src/p00.mjs';
import {qlooOnlyReadiness} from '../src/readiness.mjs';
import {checkLiveJourney} from '../src/live-journey.mjs';
import {currentLiveCodeFingerprint} from '../src/live-evidence.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))),runtime=join(root,'.runtime');
const read=name=>{try{return JSON.parse(readFileSync(join(root,name),'utf8'));}catch{return null;}};
const started=Date.now(),maxCalls=5;
const report={checkedAt:new Date().toISOString(),state:'blocked',source:'live_qloo_only_http',mode:'qloo_only',agent:'deterministic',model:null,qlooOnlyEndToEndVerified:false,liveEndToEndVerified:false,liveQlooVerified:false,providerCallsReserved:0,maxProviderCalls:maxCalls,calls:{qloo:0,openai:0},checks:[]};
try{
  const review=read('data/qloo-review.json'),mapping=read('data/qloo-mapping.json'),p00Plan=buildP00Plan(review);
  report.planFingerprint=p00Plan.fingerprint;report.codeFingerprint=currentLiveCodeFingerprint();
  const readiness=qlooOnlyReadiness({mapping,p00Plan,p00:read('test-results/p00.json'),transportCheck:inspectCliRuntime()});
  report.blockers=[...Object.entries(readiness.checks),['p00Passed',readiness.evidence.p00Passed]].filter(([,passed])=>!passed).map(([name])=>name);
  if(report.blockers.length)throw Object.assign(Error(),{code:'qloo_prerequisites_missing'});
  await withRuntimeLock(runtime,'qloo-only-smoke',async()=>{
    const daily=new DailyBudget(runtime,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));
    report.dailyBudgetRemaining=daily.remaining();
    if(daily.remaining()<maxCalls)throw Object.assign(Error(),{code:'budget_headroom_required'});
    const budget={reserve(provider){
      if(provider!=='qloo'||report.providerCallsReserved>=maxCalls)throw Object.assign(Error(),{code:'qloo_only_call_limit'});
      daily.reserve(provider);report.calls.qloo++;report.providerCallsReserved++;
    }};
    const provider=configuredQlooProvider({mapping,budget,approved:true,requestTimeoutMs:18000});
    const app=createApp({mode:'qloo_only',provider,planner:new Planner({enabled:false})});
    await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
    try{
      report.state='failed';
      const tastes=review.profiles.find(p=>p.task==='T01').tastes.map(t=>({query:t.evidence?.searchQuery||t.query,type:t.type,id:t.qlooEntityId.toLowerCase()}));
      report.checks=await checkLiveJourney({base:`http://127.0.0.1:${app.address().port}`,tastes,execution:'deterministic',reservations:()=>report.providerCallsReserved});
      if(report.calls.qloo!==5)throw Object.assign(Error(),{code:'qloo_only_call_mismatch'});
      report.state='passed';report.qlooOnlyEndToEndVerified=true;report.liveQlooVerified=true;
    }finally{await new Promise(resolve=>app.close(resolve));}
  });
}catch(error){report.code=['runtime_locked','budget_limited','budget_headroom_required','qloo_prerequisites_missing','source_unavailable','source_contract','live_identity_missing','live_source_mismatch','live_constraint_failed','live_session_failed','qloo_only_call_limit','qloo_only_call_mismatch','search_timeout','decision_timeout'].includes(error.code)?error.code:'qloo_only_check_failed';}
report.durationMs=Date.now()-started;
mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results',report.state==='blocked'?'qloo-only-smoke-blocked.json':'qloo-only-smoke.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.state!=='passed')process.exitCode=1;
