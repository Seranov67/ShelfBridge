import {readFileSync,writeFileSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export function checkRuntime(runtime,{releaseStale=false,probe=pid=>process.kill(pid,0)}={}) {
  const path=join(runtime,'server.lock');let raw,owner;
  try{raw=readFileSync(path,'utf8');}catch(e){if(e.code==='ENOENT')return {state:'unlocked',changed:false};throw e;}
  try{owner=JSON.parse(raw);}catch{return {state:'invalid_lock',changed:false};}
  if(!Number.isSafeInteger(owner.pid)||owner.pid<1||typeof owner.kind!=='string'||!Number.isFinite(Date.parse(owner.startedAt)))return {state:'invalid_lock',changed:false};
  try{probe(owner.pid);return {state:'active',pid:owner.pid,kind:owner.kind,changed:false};}
  catch(e){if(e.code!=='ESRCH')return {state:'owner_unknown',changed:false};}
  const status={state:'stale',pid:owner.pid,kind:owner.kind,changed:false};
  if(!releaseStale)return status;
  // Serialize recovery attempts. An existing process or an unverifiable owner
  // is never stopped, and a stale record remains available for diagnostics.
  const guard=join(runtime,'recovery.lock');let fd;
  try{fd=openSync(guard,'wx',0o600);}catch(e){if(e.code==='EEXIST')return {state:'recovery_in_progress',changed:false};throw e;}
  try{
    if(readFileSync(path,'utf8')!==raw)return {state:'lock_changed',changed:false};
    try{probe(owner.pid);return {state:'active',pid:owner.pid,kind:owner.kind,changed:false};}catch(e){if(e.code!=='ESRCH')return {state:'owner_unknown',changed:false};}
    const archive=join(runtime,`stale-server-lock-${owner.pid}-${Date.now()}.json`);
    writeFileSync(archive,raw,{flag:'wx',mode:0o600});
    unlinkSync(path);return {...status,state:'released_stale',changed:true};
  }finally{closeSync(fd);unlinkSync(guard);}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const args=process.argv.slice(2);if(args.some(a=>a!=='--release-stale'))throw Error('Use --release-stale, or no arguments for read-only inspection.');
  const result=checkRuntime(join(dirname(dirname(fileURLToPath(import.meta.url))),'.runtime'),{releaseStale:args.includes('--release-stale')});
  console.log(JSON.stringify(result,null,2));if(['invalid_lock','owner_unknown','recovery_in_progress','lock_changed'].includes(result.state))process.exitCode=1;
}
