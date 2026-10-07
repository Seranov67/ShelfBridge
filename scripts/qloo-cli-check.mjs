// Real pinned harness, local controlled upstream. This is not live Qloo evidence.
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {QlooCliProvider,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {catalog} from '../src/catalog.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const runtime=inspectCliRuntime();if(!runtime.ready)throw Error('Run qloo:doctor and configure a compatible harness.');
const id='abcdefab-1234-1234-1234-000000000001';const requests=[];let outside=false;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');assert.equal(req.headers['x-api-key'],'local-test-only');requests.push({path:url.pathname,params:Object.fromEntries(url.searchParams)});
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(url.pathname==='/search'?{results:[{entity_id:id,name:'Piranesi',types:['urn:entity:book']}]}:{results:{entities:[{entity_id:outside?'abcdefab-1234-1234-1234-000000000002':id}]}}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;let reservations=0;
try {
  const provider=new QlooCliProvider({env:{...process.env,QLOO_BASE_URL:base,QLOO_TRUSTED_BASE_URL:base},key:'local-test-only',mapping:{piranesi:id},approved:true,budget:{reserve(){reservations++;}}});
  const search=await provider.search('Piranesi','book');assert.equal(search[0].id,id);
  const rank=await provider.rank([catalog[0]],[search[0]]);assert.equal(rank.rows[0].workKey,'piranesi');assert.equal(requests[1].params['filter.results.entities'],id);
  outside=true;await assert.rejects(provider.rank([catalog[0]],[search[0]]),{code:'source_contract'});assert.equal(reservations,3);assert.equal(requests.length,3);
  const report={checkedAt:new Date().toISOString(),state:'passed',source:'real_cli_mock_upstream',liveQlooVerified:false,runtime,checks:['search-array-contract','exact-whitelist-insights','outside-shelf-rejected','three-reservations-no-retry'],providerCallsReserved:0,localRequests:requests.length};
  mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results','qloo-cli-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
