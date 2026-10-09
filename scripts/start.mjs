// Recommended application mode is Qloo-only; fixture remains an explicit demo.
import {loadEnvFile} from 'node:process';
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
try{loadEnvFile(join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const modes=new Map([['--fixture','fixture'],['--qloo-only','qloo_only']]);
const args=process.argv.slice(2);
if(args.length>1||(args.length&&!modes.has(args[0])))throw Error('Use --fixture or --qloo-only, or no argument.');
const mode=modes.get(args[0])||process.env.SHELFBRIDGE_MODE||'qloo_only';
const child=spawn(process.execPath,[join(root,'src/server.mjs')],{
  cwd:root,env:{...process.env,SHELFBRIDGE_MODE:mode},stdio:'inherit',shell:false
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.once('error',()=>{console.error('ShelfBridge could not start. Check the Node runtime.');process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?130:143);});
