// A deterministic protocol client, not an LLM agent or a quality benchmark.
// Default: isolated fixture server, zero external calls. --live: existing Qloo-only
// server, exactly five provider attempts on success, no retries or server restart.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {currentLiveCodeFingerprint} from '../src/live-evidence.mjs';
import {protocolVersion} from './mcp-server.mjs';
import {localBase} from './mcp-tools.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))),live=process.argv.includes('--live');
const args=process.argv.slice(2);let base='http://127.0.0.1:4318';
for(let i=0;i<args.length;i++){if(args[i]==='--live')continue;if(args[i]==='--base'&&args[i+1])base=localBase(args[++i]);else throw Error('Use --live and optionally --base http://127.0.0.1:<port>.');}
const hash=createHash('sha256');for(const p of ['scripts/mcp-tools.mjs','scripts/mcp-server.mjs','scripts/mcp-check.mjs'])hash.update(p).update(readFileSync(join(root,p)));
const report={checkedAt:new Date().toISOString(),state:'failed',source:live?'live_qloo_mcp_protocol':'controlled_fixture_mcp_protocol',protocolVersion,codeFingerprint:currentLiveCodeFingerprint(),bridgeFingerprint:hash.digest('hex'),externalAgentVerified:false,llmAgentRun:false,liveQlooVerified:false,openaiCalls:0,checks:[]};
const started=Date.now();let app,child,buffer='',stderrBytes=0,nextId=0,transportError;const pending=new Map();
const ledger=()=>JSON.parse(readFileSync(join(root,'.runtime/budget.json'),'utf8'));
function check(id,passed,details={}){if(!passed)throw Object.assign(Error(),{code:id+'_failed'});report.checks.push({id,state:'passed',...details});}
function clientRequest(method,params) {
  if(transportError)throw transportError;
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id}})+'\n');reject(Object.assign(Error(),{code:'mcp_timeout'}));},30000);
    pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
}
async function call(name,args={}) {
  const result=await clientRequest('tools/call',{name,arguments:args});
  if(result.isError)throw Object.assign(Error(),{code:result.structuredContent?.code||'mcp_tool_failed'});
  if(JSON.stringify(JSON.parse(result.content[0].text))!==JSON.stringify(result.structuredContent))throw Object.assign(Error(),{code:'mcp_result_mismatch'});
  return result.structuredContent;
}
try {
  let before;
  if(live) {
    before=ledger();report.ledgerBefore=before.calls;
    if(before.day!==new Date().toISOString().slice(0,10)||!Number.isInteger(before.calls)||before.calls<0||before.calls>55)throw Object.assign(Error(),{code:'daily_headroom_required'});
  }else {app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;}
  // The bridge needs no provider credentials. Do not forward model/cloud keys.
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['systemroot','windir','path','pathext','temp','tmp','comspec'].includes(k.toLowerCase())));
  child=spawn(process.execPath,[join(root,'scripts/mcp-server.mjs'),'--base',base,...(live?[]:['--allow-fixture'])],{cwd:root,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const broken=code=>{transportError=Object.assign(Error(),{code});for(const p of pending.values())p.reject(transportError);pending.clear();};
  child.on('error',()=>broken('mcp_process_failed'));child.on('exit',()=>broken('mcp_process_closed'));
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>16384){broken('mcp_stderr_limit');child.kill();}});
  child.stdout.on('data',chunk=>{
    buffer+=chunk.toString();if(Buffer.byteLength(buffer)>1000000){broken('mcp_output_limit');child.kill();return;}
    let index;while((index=buffer.indexOf('\n'))!==-1){let msg;try{msg=JSON.parse(buffer.slice(0,index));}catch{broken('mcp_stdout_not_json');child.kill();return;}buffer=buffer.slice(index+1);const p=pending.get(msg.id);if(!p){broken('mcp_unexpected_response');return;}pending.delete(msg.id);if(msg.error)p.reject(Object.assign(Error(),{code:'mcp_rpc_error'}));else p.resolve(msg.result);}
  });
  const init=await clientRequest('initialize',{protocolVersion,capabilities:{},clientInfo:{name:'shelfbridge-protocol-check',version:'0.1.0'}});
  check('handshake',init.protocolVersion===protocolVersion&&init.capabilities.tools.listChanged===false);
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const list=await clientRequest('tools/list',{});check('six_tools',list.tools.length===6&&list.tools.every(t=>t.inputSchema.additionalProperties===false));
  const status=await call('shelf_status');check('mode_and_inventory',status.mode===(live?'qloo_only':'fixture')&&status.inventory==='simulated'&&status.coreAgent==='deterministic');
  const reviewed=live?JSON.parse(readFileSync(join(root,'data/qloo-review.json'),'utf8')).profiles.find(p=>p.task==='T01').tastes:null;
  const tastes=live?reviewed.map(t=>({query:t.evidence?.searchQuery||t.query,type:t.type,id:t.qlooEntityId.toLowerCase()})):[{query:'Amélie',type:'movie',id:'fixture:movie:amelie'},{query:'AURORA',type:'artist',id:'fixture:artist:aurora'}];
  for(const t of tastes){const data=await call('search_tastes',{query:t.query,type:t.type});check('reviewed_'+t.type,data.source===(live?'qloo':'fixture')&&data.confirmationRequired&&data.results.some(r=>r.id===t.id&&r.type===t.type));}
  const brief={tasteIds:tastes.map(t=>t.id),budgetMinor:2500,unavailableWorkKey:'priory',userConfirmed:true};
  const shelf=await call('inspect_shelf',brief);check('inspect_before_rank',shelf.providerCalls===0&&shelf.eligibleEditions.length>0&&shelf.eligibleEditions.every(e=>e.stockCount>0&&e.priceMinor<=2500&&e.workKey!=='priory'));
  let d=(await call('find_alternatives',{briefId:shelf.briefId})).decision;check('initial_three',d.cards.length===3&&d.budgetMinor===2500&&d.source===(live?'qloo':'fixture'),{workKeys:d.cards.map(c=>c.workKey)});
  const excluded=d.cards[0].workKey;
  d=(await call('refine_selection',{kind:'exclude',workKey:excluded,decisionId:d.id,version:d.version,userConfirmed:true})).decision;check('confirmed_exclusion',d.version===2&&d.cards.length>0&&d.cards.every(c=>c.workKey!==excluded));
  const lower=await call('refine_selection',{kind:'budget',budgetMinor:1500,decisionId:d.id,version:d.version,userConfirmed:true});d=lower.decision;check('lower_budget',d.version===3&&d.budgetMinor===1500&&d.cards.length>0&&d.cards.every(c=>c.priceMinor<=1500)&&lower.refinementsLeft===0);
  const gift=await call('gift_card',{sku:d.cards[0].sku,decisionId:d.id,version:d.version,userConfirmed:true});check('current_gift',gift.sku===d.cards[0].sku&&gift.priceMinor===d.cards[0].priceMinor&&gift.inventory==='simulated'&&gift.text.includes('No purchase'));
  const beforeEmpty=live?ledger().calls:null;
  const emptyShelf=await call('inspect_shelf',{...brief,budgetMinor:100});const empty=(await call('find_alternatives',{briefId:emptyShelf.briefId})).decision;check('no_stock_no_calls',empty.state==='no_eligible_stock'&&empty.cards.length===0&&(!live||ledger().calls===beforeEmpty));
  if(live){const after=ledger();report.ledgerAfter=after.calls;report.providerCallsReserved=after.calls-before.calls;check('five_shared_ledger_calls',after.day===before.day&&report.providerCallsReserved===5);report.liveQlooVerified=true;}
  check('clean_stdio',stderrBytes===0);report.state='passed';
}catch(error){report.code=typeof error.code==='string'?error.code:'mcp_check_failed';}
finally {
  if(child){child.stdin.end();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill();resolve();},1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  if(app)await new Promise(r=>app.close(r));
}
report.durationMs=Date.now()-started;mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,live?'test-results/mcp-live-report.json':'test-results/mcp-controlled-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.state!=='passed')process.exitCode=1;
