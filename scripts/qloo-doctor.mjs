import {inspectCliRuntime,cliPaths,cliArguments,runCli} from '../src/qloo-cli.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const report={checkedAt:new Date().toISOString(),...inspectCliRuntime(),source:'local_cli_check',liveQlooVerified:false,providerCallsReserved:0,dryRunPassed:false};
if(report.ready) {
  const started=Date.now();
  try {
    const data=await runCli({...cliPaths(),args:cliArguments('/v2/insights',{'filter.type':'urn:entity:book','filter.results.entities':'abcdefab-1234-1234-1234-000000000001','signal.interests.entities':'abcdefab-1234-1234-1234-000000000002',take:3},{dryRun:true}),env:{...process.env,QLOO_API_KEY:'shelfbridge-offline-placeholder'},signal:AbortSignal.timeout(15000)});
    report.dryRunPassed=data.method==='GET'&&data.params?.['filter.results.entities']==='abcdefab-1234-1234-1234-000000000001'&&data.params?.take===3;
  }catch(error){report.code=error.code||'local_cli_failed';}
  report.dryRunDurationMs=Date.now()-started;
}
mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results','qloo-cli-doctor.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(!report.ready||!report.dryRunPassed)process.exitCode=1;
