import {readFileSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildP00Plan,replayP00,deriveExclusionRequest,collectP00} from '../src/p00.mjs';
import {configuredQlooProvider,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {hasKey} from '../src/readiness.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
function read(path,maxBytes) {
  if(statSync(path).size>maxBytes)throw Error('input_limit');
  return JSON.parse(readFileSync(path,'utf8'));
}
try {
  const [command,reviewFile,captureFile,...extra]=process.argv.slice(2);
  if(extra.length||!['plan','exclude','replay','live'].includes(command)||!reviewFile||(['plan','live'].includes(command)&&captureFile)||(['exclude','replay'].includes(command)&&!captureFile))throw Error('usage');
  const plan=buildP00Plan(read(resolve(reviewFile),250000));
  let report;
  if(command==='live') {
    if(plan.state!=='planned')throw Error('incomplete_review');
    if(!hasKey(process.env.QLOO_API_KEY))throw Error('missing_qloo_key');
    if((process.env.QLOO_TRANSPORT||'cli')!=='cli'||!inspectCliRuntime().ready)throw Error('unsupported_transport');
    report=await withRuntimeLock(join(root,'.runtime'),'qloo-p00',async()=>{
      const provider=configuredQlooProvider({mapping:plan.mapping,budget:new DailyBudget(join(root,'.runtime'),Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60))});
      return collectP00(plan,(...args)=>provider.get(...args),{transport:'cli',signal:AbortSignal.timeout(120000)});
    });
  }else report=command==='plan'?plan:(command==='exclude'?deriveExclusionRequest:replayP00)(plan,read(resolve(captureFile),2000000));
  const out=join(root,'test-results');mkdirSync(out,{recursive:true});
  writeFileSync(join(out,command==='live'?'p00.json':`qloo-p00-${command}.json`),JSON.stringify(report,null,2)+'\n');
  // Never print a raw response, input file, provider prose, or credential.
  console.log(JSON.stringify({state:report.state,source:report.source,liveQlooVerified:report.liveQlooVerified,blockers:report.blockers,requestsPlanned:plan.requests.length,maxRankingRequests:plan.maxRankingRequests,nonemptyProfiles:report.nonemptyProfiles,controlsPassed:report.controlsPassed},null,2));
  if(['blocked','failed'].includes(report.state))process.exitCode=1;
}catch(error) {
  const localCodes=['incomplete_review','missing_qloo_key','unsupported_transport'];
  console.error(error.message==='usage'?'Use: npm run qloo:p00 -- plan/live <review.json> OR exclude/replay <review.json> <captures.json>.':error.code==='invalid_request'?error.message:localCodes.includes(error.message)?`${error.message}. No calls made.`:error.code==='runtime_locked'?'runtime_locked. Stop the server before a live P00 check.':'Could not read or run P00 input. Check JSON, runtime and reviewed identities.');
  process.exitCode=1;
}
