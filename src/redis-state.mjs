import {randomBytes} from 'node:crypto';
import {fail} from './policy.mjs';
import {readProviderJson} from './http.mjs';

// All mutations run on Redis atomically. HTTP commands are never retried:
// an ambiguous timeout may already have reserved a call or acquired a lease.
export class RedisRest {
  constructor({url,token,fetchImpl=fetch,timeoutMs=3000}={}) {
    let origin;try{origin=new URL(url);}catch{throw Error('Configure Upstash Redis REST credentials.');}
    if(origin.protocol!=='https:'||origin.origin!==url||!origin.hostname.endsWith('.upstash.io')||typeof token!=='string'||!token.trim()||token.startsWith('<'))throw Error('Use the HTTPS Upstash REST origin and its write token.');
    this.url=url;this.token=token;this.fetchImpl=fetchImpl;this.timeoutMs=timeoutMs;
  }
  async command(args,signal) {
    const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(this.timeoutMs)]):AbortSignal.timeout(this.timeoutMs);
    try {
      const response=await this.fetchImpl(this.url,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:deadline,redirect:'error'});
      if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('Redis unavailable');}
      const data=await readProviderJson(response,{signal:deadline,label:'Session storage',code:'session_unavailable'});
      if(data.error||!Object.hasOwn(data,'result'))throw Error('Redis command failed');
      return data.result;
    }catch{throw fail('Shared state is unavailable. No provider request was started by this command.',503,'session_unavailable');}
  }
  eval(script,keys,args=[],signal){return this.command(['EVAL',script,String(keys.length),...keys,...args.map(String)],signal);}
}

export const reserveScript=`
local t=redis.call('TIME'); local day=math.floor(tonumber(t[1])/86400)
local rawday=redis.call('HGET',KEYS[1],'day'); local oldday=tonumber(rawday)
if rawday and (not oldday or oldday>day) then return {-1} end
local calls=0; local limit=tonumber(ARGV[1])
if oldday==day then
  calls=tonumber(redis.call('HGET',KEYS[1],'calls'))
  local oldlimit=tonumber(redis.call('HGET',KEYS[1],'limit'))
  if not calls or calls<0 or calls~=math.floor(calls) or not oldlimit or oldlimit<1 or oldlimit>1000 then return {-1} end
  limit=math.min(limit,oldlimit)
end
if calls>=limit then return {0,calls} end
calls=calls+1
redis.call('HSET',KEYS[1],'day',day,'calls',calls,'limit',limit,'lastProvider',ARGV[2])
redis.call('EXPIRE',KEYS[1],172800)
return {1,calls}`;

export class RedisDailyBudget {
  constructor(redis,namespace,limit=60){
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid daily limit');
    this.redis=redis;this.key=statePrefix(namespace)+':budget';this.limit=limit;
  }
  async reserve(provider,signal){
    const result=await this.redis.eval(reserveScript,[this.key],[this.limit,provider],signal);
    if(!Array.isArray(result)||![0,1].includes(result[0]))throw fail('The usage ledger needs operator attention.',503,'budget_limited');
    if(result[0]===0)throw fail('Today’s demo call limit has been reached. Please return tomorrow.',429,'budget_limited');
    return result[1];
  }
  async importLocal(ledger){
    if(!ledger||!/^\d{4}-\d{2}-\d{2}$/.test(ledger.day)||!Number.isInteger(ledger.calls)||ledger.calls<0)throw Error('Invalid local usage ledger');
    const day=Date.parse(ledger.day+'T00:00:00Z')/86400000;
    if(!Number.isInteger(day)||new Date(day*86400000).toISOString().slice(0,10)!==ledger.day)throw Error('Invalid local ledger date');
    return this.redis.eval(importBudgetScript,[this.key],[day,ledger.calls,this.limit]);
  }
}

export const importBudgetScript=`
local t=redis.call('TIME'); local day=math.floor(tonumber(t[1])/86400)
if tonumber(ARGV[1])~=day then return {0,'different_utc_day'} end
local rawday=redis.call('HGET',KEYS[1],'day'); local oldday=tonumber(rawday)
if rawday and (not oldday or oldday>day) then return {-1,'invalid_ledger'} end
local calls=tonumber(ARGV[2]); local limit=tonumber(ARGV[3])
if oldday==day then
  local oldcalls=tonumber(redis.call('HGET',KEYS[1],'calls')); local oldlimit=tonumber(redis.call('HGET',KEYS[1],'limit'))
  if not oldcalls or oldcalls<0 or not oldlimit or oldlimit<1 then return {-1,'invalid_ledger'} end
  calls=math.max(calls,oldcalls); limit=math.min(limit,oldlimit)
end
redis.call('HSET',KEYS[1],'day',day,'calls',calls,'limit',limit)
redis.call('EXPIRE',KEYS[1],172800)
return {1,calls,limit}`;

function statePrefix(namespace){
  if(typeof namespace!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(namespace))throw Error('Configure a stable SHELFBRIDGE_STATE_NAMESPACE.');
  return 'shelfbridge:{'+namespace+'}';
}

export const acquireScript=`
local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local payload=redis.call('GET',KEYS[1]); local created=0
if not payload then
  if ARGV[6]~='1' then return {0,'missing'} end
  redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
  if redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[3]) then return {0,'capacity'} end
  local count=tonumber(redis.call('GET',KEYS[4]) or '0')
  if count>=tonumber(ARGV[4]) then return {0,'creation_limit'} end
  local expires=now+1800000
  -- Preserve JSON empty arrays; Lua cjson would encode them as empty objects.
  payload=string.gsub(ARGV[5],'"expires":0','"expires":'..string.format('%.0f',expires),1)
  redis.call('SET',KEYS[1],payload,'PX',1800000)
  redis.call('ZADD',KEYS[3],expires,ARGV[1]); redis.call('EXPIRE',KEYS[3],3600)
  redis.call('INCR',KEYS[4]); if count==0 then redis.call('EXPIRE',KEYS[4],3600) end
  created=1
end
if not redis.call('SET',KEYS[2],ARGV[2],'NX','PX',60000) then return {0,'busy'} end
return {1,created,payload}`;

export const saveScript=`
if redis.call('GET',KEYS[2])~=ARGV[1] then return 0 end
local ttl=redis.call('PTTL',KEYS[1]); if ttl<=0 then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'PX',ttl)
return 1`;
export const releaseScript=`
if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end
return 0`;

export class RedisSessionStore {
  constructor(redis,namespace,{maxSessions=200,maxNewSessionsPerHour=200}={}){
    if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>1000||!Number.isInteger(maxNewSessionsPerHour)||maxNewSessionsPerHour<1||maxNewSessionsPerHour>1000)throw Error('Invalid shared session limits');
    this.redis=redis;this.prefix=statePrefix(namespace);this.maxSessions=maxSessions;this.maxNewSessionsPerHour=maxNewSessionsPerHour;
  }
  async acquire(cookie){
    let token=/^[a-f0-9]{64}$/.test(cookie||'')?cookie:null;const owner=randomBytes(32).toString('hex');
    const keyList=token=>[`${this.prefix}:session:${token}`,`${this.prefix}:lease:${token}`,`${this.prefix}:sessions`,`${this.prefix}:creations`];
    const initial={tastes:[],request:null,decision:null,refinements:0,runs:0,searches:0,busy:false,expires:0};
    let result;
    if(token)result=await this.redis.eval(acquireScript,keyList(token),[token,owner,this.maxSessions,this.maxNewSessionsPerHour,JSON.stringify(initial),0]);
    if(!token||result?.[1]==='missing'){
      token=randomBytes(32).toString('hex');
      result=await this.redis.eval(acquireScript,keyList(token),[token,owner,this.maxSessions,this.maxNewSessionsPerHour,JSON.stringify(initial),1]);
    }
    const keys=keyList(token);
    if(!Array.isArray(result)||result[0]!==1){
      const code=result?.[1];
      if(code==='busy')throw fail('This session is processing a request. Reload when it finishes.',409,'version_conflict');
      if(code==='capacity')throw fail('The demo is at capacity. Try again later.',503,'capacity');
      if(code==='creation_limit')throw fail('New session limit reached. Please try again later.',429,'session_creation_limit');
      throw fail('Session storage needs operator attention.',503,'session_unavailable');
    }
    let session;
    try{session=JSON.parse(result[2]);session.tastes=new Map(session.tastes);session.busy=false;}
    catch{await this.redis.eval(releaseScript,[keys[1]],[owner]);throw fail('Session data needs operator attention.',503,'session_unavailable');}
    return {session,token,isNew:result[1]===1,
      save:async()=>{
        const payload=JSON.stringify({...session,tastes:[...session.tastes]});
        if(Buffer.byteLength(payload)>250000)throw fail('Session exceeds its storage limit.',503,'session_unavailable');
        const saved=await this.redis.eval(saveScript,keys.slice(0,2),[owner,payload]);
        if(saved!==1)throw fail('This session expired or its request lease was lost. Please reconnect.',409,'session_expired');
      },
      release:()=>this.redis.eval(releaseScript,[keys[1]],[owner])
    };
  }
}
