import {fail} from './policy.mjs';

// Enforce a deadline even while waiting for a response body or an uncooperative adapter.
export async function withSignal(operation,signal) {
  if(!signal)return operation;
  if(signal.aborted){void Promise.resolve(operation).catch(()=>{});signal.throwIfAborted();}
  let abort;
  const cancelled=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([operation,cancelled]);}
  finally{signal.removeEventListener('abort',abort);}
}

export async function readProviderJson(response,{signal,label,code,maxBytes=1000000}) {
  let content;
  if(response.body?.getReader) {
    const reader=response.body.getReader();let complete=false;
    try {
      const declared=Number(response.headers?.get('content-length'));
      if(declared>maxBytes)throw fail(`${label} response exceeded the contract limit.`,502,code);
      const chunks=[];let size=0;
      while(true) {
        const {done,value}=await withSignal(reader.read(),signal);
        if(done){complete=true;break;}
        size+=value.byteLength;
        if(size>maxBytes)throw fail(`${label} response exceeded the contract limit.`,502,code);
        chunks.push(value);
      }
      content=Buffer.concat(chunks,size).toString('utf8');
    }finally{if(!complete)void reader.cancel().catch(()=>{});reader.releaseLock();}
  }else {
    // Injectable test transports may expose text() without a streaming body.
    content=await withSignal(response.text(),signal);
    if(Buffer.byteLength(content,'utf8')>maxBytes)throw fail(`${label} response exceeded the contract limit.`,502,code);
  }
  try{return JSON.parse(content);}catch{throw fail(`${label} returned unreadable data.`,502,code);}
}
