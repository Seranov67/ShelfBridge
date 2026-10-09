import {loadEnvFile} from 'node:process';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RedisRest,RedisDailyBudget} from '../src/redis-state.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
try{loadEnvFile(join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
try{
  const args=process.argv.slice(2);if(args.length>1||args.length&&args[0]!=='--import-local-budget')throw Error('Use no argument for a read-only check, or --import-local-budget.');
  const redis=new RedisRest({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});
  const budget=new RedisDailyBudget(redis,process.env.SHELFBRIDGE_STATE_NAMESPACE,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));
  if(await redis.command(['PING'])!=='PONG')throw Error('Redis unavailable');
  let imported=null;
  if(args.length){
    imported=await budget.importLocal(JSON.parse(readFileSync(join(root,'.runtime','budget.json'),'utf8')));
    if(imported[0]!==1)throw Error('Budget import refused: '+imported[1]);
  }
  console.log(JSON.stringify({state:'passed',source:'redis_configuration_check',providerCallsReserved:0,imported,
    ledger:await redis.command(['HMGET',budget.key,'day','calls','limit'])},null,2));
}catch(error){console.error(JSON.stringify({state:'failed',error:error.status?error.message:'Redis configuration or local ledger needs operator attention.',providerCallsReserved:0}));process.exitCode=1;}
