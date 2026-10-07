import {mkdirSync,openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fail} from './policy.mjs';

export function acquireRuntimeLock(runtime,kind='server') {
  mkdirSync(runtime,{recursive:true});const path=join(runtime,'server.lock');let fd;
  try{fd=openSync(path,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw fail('The ShelfBridge runtime is in use. Stop the server before running a live check.',503,'runtime_locked');throw error;}
  try{writeFileSync(fd,JSON.stringify({pid:process.pid,kind,startedAt:new Date().toISOString()}));}
  catch(error){closeSync(fd);unlinkSync(path);throw error;}
  let released=false;
  return ()=>{if(released)return;released=true;try{closeSync(fd);}finally{unlinkSync(path);}};
}

export async function withRuntimeLock(runtime,kind,operation) {
  const release=acquireRuntimeLock(runtime,kind);
  try{return await operation();}finally{release();}
}
