// At most 14 reservations: 2 exact searches, then 3 decisions with <=3 planner
// calls and 1 Qloo ranking each. No retry, automatic mode change or raw payloads.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
import {Planner} from '../src/agent.mjs';
import {configuredQlooProvider,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {buildP00Plan} from '../src/p00.mjs';
import {readinessReport} from '../src/readiness.mjs';
import {checkLiveJourney} from '../src/live-journey.mjs';
import {currentLiveCodeFingerprint} from '../src/live-evidence.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const runtime=join(root,'.runtime');
const read=name=>{try{return JSON.parse(readFileSync(join(root,name),'utf8'));}catch{return null;}};
const maxCalls=14;let calls=0;const started=Date.now();
const report={checkedAt:new Date().toISOString(),state:'blocked',source:'live_qloo_openai_http',model:process.env.OPENAI_MODEL||'gpt-4.1-mini',liveEndToEndVerified:false,liveQlooVerified:false,providerCallsReserved:0,maxProviderCalls:maxCalls,checks:[]};
try {
  const review=read('data/qloo-review.json');const mapping=read('data/qloo-mapping.json');
  const plan=buildP00Plan(review);
  const readiness=readinessReport({mapping,p00Plan:plan,p00:read('test-results/p00.json'),plannerSmoke:read('test-results/llm-smoke.json'),transportCheck:inspectCliRuntime()});
  report.planFingerprint=plan.fingerprint;
  report.blockers=[...Object.entries(readiness.checks),...Object.entries(readiness.evidence).filter(([name])=>name!=='realEndToEndPassed')].filter(([,passed])=>!passed).map(([name])=>name);
  const snapshot=read('.runtime/budget.json');const today=new Date().toISOString().slice(0,10);
  report.dailyBudgetRemaining=snapshot?.day===today&&Number.isInteger(snapshot.calls)?Math.max(0,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60)-snapshot.calls):Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60);
  report.budgetResetsAt=new Date(Date.parse(`${today}T00:00:00Z`)+86400000).toISOString();
  if(report.dailyBudgetRemaining<maxCalls)report.blockers.push('dailyBudgetHeadroom');
  if(report.blockers.length)throw Object.assign(Error(),{code:'live_prerequisites_missing'});
  report.codeFingerprint=currentLiveCodeFingerprint();
  await withRuntimeLock(runtime,'live-smoke',async()=>{
    const limit=Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60);
    const ledger=read('.runtime/budget.json');
    if(ledger&&(!Number.isInteger(ledger.calls)||ledger.calls<0||typeof ledger.day!=='string'))throw Object.assign(Error(),{code:'budget_limited'});
    const used=ledger?.day===new Date().toISOString().slice(0,10)?ledger.calls:0;
    if(limit-used<maxCalls)throw Object.assign(Error(),{code:'budget_headroom_required'});
    const daily=new DailyBudget(runtime,limit);
    const budget={reserve(provider){if(calls>=maxCalls)throw Object.assign(Error(),{code:'live_call_limit'});daily.reserve(provider);calls++;}};
    const provider=configuredQlooProvider({mapping,budget,approved:true});
    const planner=new Planner({key:process.env.OPENAI_API_KEY,model:report.model,budget,enabled:true});
    const app=createApp({mode:'live',provider,planner});
    await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
    try {
      report.state='failed';
      const profile=review.profiles.find(p=>p.task==='T01');
      const tastes=profile.tastes.map(t=>({query:t.evidence?.searchQuery||t.query,type:t.type,id:t.qlooEntityId.toLowerCase()}));
      report.checks=await checkLiveJourney({base:`http://127.0.0.1:${app.address().port}`,tastes,reservations:()=>calls});
      report.state='passed';report.liveEndToEndVerified=true;report.liveQlooVerified=true;
    }finally{await new Promise(resolve=>app.close(resolve));}
  });
}catch(error){report.code=typeof error.code==='string'?error.code:'live_check_failed';}
report.durationMs=Date.now()-started;report.providerCallsReserved=calls;
mkdirSync(join(root,'test-results'),{recursive:true});
writeFileSync(join(root,'test-results',report.state==='blocked'?'live-smoke-blocked.json':'live-smoke.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.state!=='passed')process.exitCode=1;
