import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readinessReport,qlooOnlyReadiness} from '../src/readiness.mjs';
import {buildP00Plan} from '../src/p00.mjs';
import {inspectCliRuntime} from '../src/qloo-cli.mjs';
import {currentLiveCodeFingerprint} from '../src/live-evidence.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
function read(path){try{return JSON.parse(readFileSync(join(root,path),'utf8'));}catch{return null;}}
let p00Plan=null;try{p00Plan=buildP00Plan(read('data/qloo-review.json'));}catch{}
const qlooOnly=process.argv.includes('--qloo-only')||(!process.argv.includes('--full-live')&&process.env.SHELFBRIDGE_MODE==='qloo_only');
const report=(qlooOnly?qlooOnlyReadiness:readinessReport)({mapping:read('data/qloo-mapping.json'),plannerSmoke:read('test-results/llm-smoke.json'),p00:read('test-results/p00.json'),p00Plan,transportCheck:inspectCliRuntime(),liveSmoke:read('test-results/live-smoke.json'),qlooOnlySmoke:read('test-results/qloo-only-smoke.json'),liveCodeFingerprint:currentLiveCodeFingerprint()});
mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results',qlooOnly?'preflight-qloo-only.json':'preflight.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.runtimeConfigurationReady||!report.liveIntegrationEvidenceReady)process.exitCode=1;
