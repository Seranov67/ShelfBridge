import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequestHandler} from './server.mjs';
import {validateMapping} from './providers.mjs';
import {Planner} from './agent.mjs';
import {configuredQlooProvider,inspectCliRuntime} from './qloo-cli.mjs';
import {buildP00Plan} from './p00.mjs';
import {qlooOnlyReadiness} from './readiness.mjs';
import {currentLiveCodeFingerprint} from './live-evidence.mjs';
import {RedisRest,RedisDailyBudget,RedisSessionStore} from './redis-state.mjs';
import {fail} from './policy.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function vercelEnvironment(env=process.env){
  return {...env,SHELFBRIDGE_MODE:'qloo_only',QLOO_TRANSPORT:'cli',
    QLOO_CLI_ENTRY:join(root,'node_modules','@qloo','qloo-harness','dist','bin.js'),
    QLOO_NODE_PATH:process.execPath,SHELFBRIDGE_QLOO_HOME:'/tmp/shelfbridge-qloo'};
}

export function createVercelHandler({env=process.env}={}){
  if(env.SHELFBRIDGE_MODE&&env.SHELFBRIDGE_MODE!=='qloo_only')throw fail('Vercel deployment requires Qloo-only mode.',503,'deployment_configuration');
  if(!env.PUBLIC_ORIGIN?.startsWith('https://'))throw fail('Configure the stable HTTPS public website origin.',503,'deployment_configuration');
  const configured=vercelEnvironment(env);
  const read=name=>JSON.parse(readFileSync(join(root,name),'utf8'));
  const evidence=(key,path)=>{try{return env[key]?JSON.parse(env[key]):read(path);}catch{return null;}};
  const mapping=validateMapping(read('data/qloo-mapping.json'));
  const report=qlooOnlyReadiness({env:configured,mapping,p00Plan:buildP00Plan(read('data/qloo-review.json')),
    p00:evidence('SHELFBRIDGE_P00_REPORT','test-results/p00.json'),
    qlooOnlySmoke:evidence('SHELFBRIDGE_QLOO_SMOKE_REPORT','test-results/qloo-only-smoke.json'),
    transportCheck:inspectCliRuntime(configured),liveCodeFingerprint:currentLiveCodeFingerprint()});
  if(!report.runtimeConfigurationReady||!report.liveIntegrationEvidenceReady)throw fail('Verify the current Qloo-only configuration and HTTP journey before activating this deployment.',503,'qloo_only_not_verified');
  const redis=new RedisRest({url:env.UPSTASH_REDIS_REST_URL,token:env.UPSTASH_REDIS_REST_TOKEN});
  const namespace=env.SHELFBRIDGE_STATE_NAMESPACE;
  const budget=new RedisDailyBudget(redis,namespace,Number(env.DAILY_PROVIDER_CALL_LIMIT||60));
  const sessionStore=new RedisSessionStore(redis,namespace,{maxSessions:Number(env.MAX_SESSIONS||200),maxNewSessionsPerHour:Number(env.MAX_NEW_SESSIONS_PER_HOUR||200)});
  const provider=configuredQlooProvider({env:configured,mapping,budget,approved:true,requestTimeoutMs:18000});
  return createRequestHandler({mode:'qloo_only',provider,planner:new Planner({enabled:false}),sessionStore,publicOrigin:env.PUBLIC_ORIGIN,secureCookies:true});
}
