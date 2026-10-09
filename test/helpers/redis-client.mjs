import {createConnection} from 'node:net';

// Test-only RESP client. Production uses Upstash HTTPS; these checks execute
// the same Lua scripts on a real local Redis without a cloud account.
export function redisCommand(url,args){
  return new Promise((resolve,reject)=>{
    const target=new URL(url),socket=createConnection({host:target.hostname,port:Number(target.port||6379)});
    let buffer=Buffer.alloc(0);
    socket.setTimeout(5000,()=>socket.destroy(Error('Redis test timeout')));
    socket.once('error',reject);
    socket.once('connect',()=>{
      const chunks=[Buffer.from(`*${args.length}\r\n`)];
      for(const value of args){const data=Buffer.from(String(value));chunks.push(Buffer.from(`$${data.length}\r\n`),data,Buffer.from('\r\n'));}
      socket.write(Buffer.concat(chunks));
    });
    function parse(offset){
      const end=buffer.indexOf('\r\n',offset);if(end<0)return null;
      const kind=String.fromCharCode(buffer[offset]),text=buffer.subarray(offset+1,end).toString(),next=end+2;
      if(kind==='-')throw Error(text);
      if(kind==='+')return {value:text,next};
      if(kind===':')return {value:Number(text),next};
      if(kind==='$'){const length=Number(text);if(length===-1)return {value:null,next};if(buffer.length<next+length+2)return null;return {value:buffer.subarray(next,next+length).toString(),next:next+length+2};}
      if(kind==='*'){const count=Number(text);if(count===-1)return {value:null,next};let cursor=next;const value=[];for(let i=0;i<count;i++){const part=parse(cursor);if(!part)return null;value.push(part.value);cursor=part.next;}return {value,next:cursor};}
      throw Error('Unexpected Redis response');
    }
    socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);try{const result=parse(0);if(result){socket.end();resolve(result.value);}}catch(error){socket.destroy();reject(error);}});
  });
}
export function localRedis(url){return {
  command:args=>redisCommand(url,args),
  eval:(script,keys,args=[])=>redisCommand(url,['EVAL',script,keys.length,...keys,...args])
};}
