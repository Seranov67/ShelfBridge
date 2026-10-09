import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {QlooProvider} from './providers.mjs';
import {fail} from './policy.mjs';
import {withSignal} from './http.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export const supportedHarnessVersion='0.1.26';
export function cliPaths(env=process.env) {
  const localNode=join(root,'.tools','node','node.exe');
  const installed=join(root,'node_modules','@qloo','qloo-harness','dist','bin.js');
  return {node:env.QLOO_NODE_PATH||((process.platform==='win32'&&existsSync(localNode))?localNode:process.execPath),entry:env.QLOO_CLI_ENTRY||(existsSync(installed)?installed:join(root,'.tools','runtime','node_modules','@qloo','qloo-harness','dist','bin.js')),home:env.SHELFBRIDGE_QLOO_HOME||join(root,'.runtime','qloo')};
}
export function inspectCliRuntime(env=process.env) {
  const paths=cliPaths(env);let nodeVersion=null,harnessVersion=null;
  try {
    const version=spawnSync(paths.node,['--version'],{encoding:'utf8',timeout:3000,windowsHide:true,maxBuffer:1000,env:childEnvironment(env,paths.home)});
    if(version.status===0&&/^v\d+\.\d+\.\d+\s*$/.test(version.stdout))nodeVersion=version.stdout.trim().slice(1);
    const metadata=JSON.parse(readFileSync(resolve(dirname(paths.entry),'..','package.json'),'utf8'));
    if(metadata.name==='@qloo/qloo-harness'&&existsSync(paths.entry))harnessVersion=metadata.version;
  }catch{}
  const parts=nodeVersion?.split('.').map(Number)||[];
  const nodeReady=parts[0]>22||(parts[0]===22&&parts[1]>=19);
  return {kind:'cli',ready:Boolean(nodeReady&&harnessVersion===supportedHarnessVersion),nodeVersion,harnessVersion,expectedHarnessVersion:supportedHarnessVersion};
}
function childEnvironment(env,home) {
  const child={QLOO_HOME:home,NO_COLOR:'1',PI_OFFLINE:'1',PI_SKIP_VERSION_CHECK:'1',PI_TELEMETRY:'0'};
  for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP'])if(env[key])child[key]=env[key];
  // Only this provider's credential and explicitly configured gateway are forwarded.
  for(const key of ['QLOO_API_KEY','QLOO_BASE_URL','QLOO_TRUSTED_BASE_URL'])if(env[key])child[key]=env[key];
  return child;
}
export function runCli({node,entry,home,args,env=process.env,signal,maxBytes=1000000}) {
  return new Promise((resolveResult,reject)=>{
    if(signal?.aborted){reject(signal.reason);return;}
    const child=spawn(node,['--max-old-space-size=128','--import',pathToFileURL(join(root,'src','qloo-cli-guard.mjs')).href,entry,...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:childEnvironment(env,home)});
    const chunks=[];let bytes=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);if(error){child.kill('SIGKILL');reject(error);}else resolveResult(value);};
    const abort=()=>finish(signal.reason||fail('Qloo request cancelled.',499,'cancelled'));
    signal?.addEventListener('abort',abort,{once:true});
    const collect=(chunk,keep)=>{bytes+=chunk.length;if(bytes>maxBytes){finish(fail('Qloo CLI output exceeded the contract limit.',502,'source_contract'));return;}if(keep)chunks.push(chunk);};
    child.stdout.on('data',chunk=>collect(chunk,true));child.stderr.on('data',chunk=>collect(chunk,false));
    child.once('error',()=>finish(fail('Qloo CLI could not start. Check the local runtime.',503,'source_unavailable')));
    child.once('close',code=>{
      if(settled)return;
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{finish(fail('Qloo CLI returned unreadable data.',502,'source_contract'));return;}
      if(code!==0||data?.error===true){
        const auth=data?.code==='AUTH_FAILED';
        finish(fail(auth?'Qloo authentication failed. Contact the demo operator.':'Qloo CLI request failed. No simulated results were substituted.',503,'source_unavailable'));return;
      }
      finish(null,data);
    });
  });
}
export function cliArguments(path,params,{dryRun=false}={}) {
  let args;
  if(path==='/search')args=['api','--quiet','search','--query',params.query,'--type',params.types,'--take',String(params.take),'--json'];
  else if(path==='/v2/insights')args=['api','--quiet','insights','--type','book','--take',String(params.take),'--params',JSON.stringify(params),'--json'];
  else throw fail('Unsupported Qloo CLI operation.',400,'invalid_request');
  if(dryRun)args.push('--dry-run');return args;
}

export class QlooCliProvider extends QlooProvider {
  transport='cli';
  constructor({env=process.env,runner=runCli,runtimeCheck=inspectCliRuntime,requestTimeoutMs=7000,...options}) {
    if(!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>20000)throw Error('Invalid Qloo CLI deadline');
    super({...options,key:options.key??env.QLOO_API_KEY});this.requestTimeoutMs=requestTimeoutMs;this.env=env;this.runner=runner;this.paths=cliPaths(env);this.runtimeCheck=runtimeCheck;
  }
  ensureRuntime() {
    this.runtime??=this.runtimeCheck(this.env);
    if(!this.runtime.ready)throw fail('Qloo CLI needs a compatible Node runtime and the supported harness.',503,'source_unavailable');
  }
  async get(path,params,signal) {
    this.ensureRuntime();
    if(typeof this.key!=='string'||!this.key.trim()||this.key.trim().startsWith('<'))throw fail('Qloo is not configured on this server.',503,'source_unavailable');
    const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(this.requestTimeoutMs)]):AbortSignal.timeout(this.requestTimeoutMs);
    deadline.throwIfAborted();const args=cliArguments(path,params);await this.budget.reserve('qloo',deadline);deadline.throwIfAborted();
    let data;
    try{data=await withSignal(this.runner({...this.paths,args,env:{...this.env,QLOO_API_KEY:this.key},signal:deadline}),deadline);}
    catch(error){if(error.status)throw error;throw fail('Qloo CLI did not respond in time. No simulated results were substituted.',503,'source_unavailable');}
    if(!Array.isArray(data))throw fail('Qloo CLI entity-array contract is not verified.',502,'source_contract');
    return path==='/search'?{results:data}:{results:{entities:data}};
  }
  checkReady(candidates,tastes){this.ensureRuntime();super.checkReady(candidates,tastes);}
}
export function configuredQlooProvider({env=process.env,...options}) {
  const kind=env.QLOO_TRANSPORT||'cli';
  if(kind==='cli')return new QlooCliProvider({env,...options});
  if(kind==='http_legacy')return new QlooProvider({key:env.QLOO_API_KEY,...options});
  throw Error('Choose QLOO_TRANSPORT=cli or http_legacy');
}
