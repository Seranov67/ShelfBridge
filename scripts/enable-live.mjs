// Local mode change only after complete current provider evidence. No API calls.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readinessReport,qlooOnlyReadiness} from '../src/readiness.mjs';
import {buildP00Plan} from '../src/p00.mjs';
import {inspectCliRuntime} from '../src/qloo-cli.mjs';
import {currentLiveCodeFingerprint} from '../src/live-evidence.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=name=>{try{return JSON.parse(readFileSync(join(root,name),'utf8'));}catch{return null;}};
const qlooOnly=process.argv.includes('--qloo-only'),mode=qlooOnly?'qloo_only':'live';
try {
  const p00Plan=buildP00Plan(read('data/qloo-review.json'));
  const report=(qlooOnly?qlooOnlyReadiness:readinessReport)({mapping:read('data/qloo-mapping.json'),p00Plan,p00:read('test-results/p00.json'),plannerSmoke:read('test-results/llm-smoke.json'),transportCheck:inspectCliRuntime(),liveSmoke:read('test-results/live-smoke.json'),qlooOnlySmoke:read('test-results/qloo-only-smoke.json'),liveCodeFingerprint:currentLiveCodeFingerprint()});
  const blockers=[...Object.entries(report.checks),...Object.entries(report.evidence)].filter(([,passed])=>!passed).map(([name])=>name);
  if(blockers.length){console.error(JSON.stringify({state:'blocked',blockers,providerCalls:0}));process.exitCode=1;}
  else {
    if(existsSync(join(root,'.runtime','server.lock')))throw Object.assign(Error(),{code:'runtime_locked'});
    const path=join(root,'.env');const content=readFileSync(path,'utf8');
    if((content.match(/^SHELFBRIDGE_MODE=(?:fixture|live|qloo_only)\s*$/gm)||[]).length!==1)throw Object.assign(Error(),{code:'mode_configuration_invalid'});
    writeFileSync(path,content.replace(/^SHELFBRIDGE_MODE=(?:fixture|live|qloo_only)[^\r\n]*$/m,`SHELFBRIDGE_MODE=${mode}`));
    console.log(JSON.stringify({state:'enabled',mode,providerCalls:0,instruction:'Start ShelfBridge to use the verified mode.'}));
  }
}catch(error){console.error(JSON.stringify({state:'blocked',code:typeof error.code==='string'?error.code:'live_configuration_failed',providerCalls:0}));process.exitCode=1;}
