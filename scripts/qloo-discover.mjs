// Resumable, bounded identity searches. Candidates are evidence, not approval.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cliPaths,cliArguments,runCli,inspectCliRuntime} from '../src/qloo-cli.mjs';
import {parseQlooSearch} from '../src/qloo-contract.mjs';
import {DailyBudget} from '../src/budget.mjs';
import {withRuntimeLock} from '../src/runtime.mjs';
import {hasKey} from '../src/readiness.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const output=join(root,'test-results','qloo-identity-candidates.json');
const count=Number(process.argv[2]||5);
const review=JSON.parse(readFileSync(join(root,'data','qloo-review.example.json'),'utf8'));
const defaultQueries=[...new Map([
  ...review.works.map(w=>({query:w.title,type:'book',expectedAuthor:w.author,workKey:w.workKey})),
  ...review.profiles.flatMap(p=>p.tastes.map(t=>({query:t.query,type:t.type})))
].map(q=>[`${q.type}:${q.query}`,q])).values()];
const [customQuery,customType,...extra]=process.argv.slice(3);
const queries=customQuery?[{query:customQuery,type:customType}]:defaultQueries;
const propertiesAllowed=['author','authors','author_names','publisher','publication_year','release_year','original_title','description','short_description','isbn','isbn10','isbn13'];
function small(value,depth=0) {
  if(typeof value==='string')return value.slice(0,400);
  if(typeof value==='number'||typeof value==='boolean'||value===null)return value;
  if(depth>2)return undefined;
  if(Array.isArray(value))return value.slice(0,8).map(v=>small(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>['name','id','url','title','value','type','author','authors'].includes(k)).slice(0,8).map(([k,v])=>[k,small(v,depth+1)]));
}
try {
  if(!Number.isInteger(count)||count<1||count>5)throw Error('invalid_batch_size');
  if(extra.length||Boolean(customQuery)!==Boolean(customType)||queries.some(q=>typeof q.query!=='string'||!q.query.trim()||q.query.length>100||!['book','movie','artist'].includes(q.type)))throw Error('invalid_query');
  if(!hasKey(process.env.QLOO_API_KEY)||!inspectCliRuntime().ready)throw Error('local_setup_missing');
  let saved=[];try{saved=JSON.parse(readFileSync(output,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!Array.isArray(saved))throw Error('invalid_evidence');
  const done=new Set(saved.map(q=>`${q.type}:${q.query}`));
  const pending=queries.filter(q=>!done.has(`${q.type}:${q.query}`)).slice(0,count);
  await withRuntimeLock(join(root,'.runtime'),'qloo-discovery',async()=>{
    const budget=new DailyBudget(join(root,'.runtime'),Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));
    for(const query of pending) {
      budget.reserve('qloo');
      const data=await runCli({...cliPaths(),args:cliArguments('/search',{query:query.query,types:query.type,take:5}),signal:AbortSignal.timeout(7000)});
      const parsed=parseQlooSearch({results:data},query.type);
      const candidates=parsed.map(c=>{
        const entity=data.find(e=>e.entity_id.toLowerCase()===c.id);
        const properties=Object.fromEntries(propertiesAllowed.filter(k=>Object.hasOwn(entity.properties||{},k)).map(k=>[k,small(entity.properties[k])]));
        const external=entity.properties?.external||entity.external;
        const references=Array.isArray(external)?external.slice(0,6).map(v=>small(v)):external&&typeof external==='object'?Object.fromEntries(Object.entries(external).slice(0,6).map(([k,v])=>[k,small(v)])):undefined;
        const authorTags=Array.isArray(entity.tags)?entity.tags.filter(t=>/author/i.test(t.tag_id||t.type||'')).slice(0,8).map(t=>({id:t.tag_id,name:t.name})):[];
        return {...c,properties,disambiguation:small(entity.disambiguation),propertyKeys:Object.keys(entity.properties||{}),entityKeys:Object.keys(entity),authorTags,references};
      });
      saved.push({...query,checkedAt:new Date().toISOString(),endpoint:process.env.QLOO_BASE_URL||'https://api.qloo.com',transport:'cli',candidates,identityReviewed:false});
      mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(saved,null,2)+'\n');
      const completed=queries.filter(q=>saved.some(s=>s.type===q.type&&s.query===q.query)).length;
      console.log(JSON.stringify({query:query.query,type:query.type,candidates:candidates.map(c=>({id:c.id,name:c.name,disambiguation:c.disambiguation,isbn:c.properties.isbn13,year:c.properties.publication_year||c.properties.release_year})),completed,total:queries.length,cachedSearches:saved.length}));
    }
  });
}catch(error){console.error(JSON.stringify({code:typeof error.code==='string'?error.code:'discovery_failed'}));process.exitCode=1;}
