// Bounded, read-only live search probe. Prints only candidate identities, never headers.
import {configuredQlooProvider} from '../src/qloo-cli.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {catalog} from '../src/catalog.mjs';
import {dirname,join} from 'node:path';
import {withRuntimeLock} from '../src/runtime.mjs';
import {hasKey} from '../src/readiness.mjs';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
if(!hasKey(process.env.QLOO_API_KEY)){console.error('QLOO_API_KEY is missing. No calls made.');process.exit(1);}
const keys=process.argv.slice(2);if(!keys.length||keys.length>5){console.error('Pass 1–5 local work keys, e.g. npm run probe -- piranesi earthsea');process.exit(1);}
if(keys.some(key=>!catalog.some(e=>e.workKey===key))){console.error('Unknown local work key');process.exit(1);}
if(new Set(keys).size!==keys.length){console.error('Pass distinct work keys. No calls made.');process.exit(1);}
const runtime=join(root,'.runtime');
try {
  await withRuntimeLock(runtime,'qloo-probe',async()=>{
    const provider=configuredQlooProvider({budget:new DailyBudget(runtime,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60))});
    for(const key of keys){const e=catalog.find(e=>e.workKey===key);const results=await provider.search(e.title,'book');console.log(JSON.stringify({workKey:key,expectedAuthor:e.author,candidates:results,verified:false}));}
  });
}catch(error){console.error(error.code||'probe_failed');process.exitCode=1;}
