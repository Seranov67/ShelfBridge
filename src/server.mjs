import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {catalog,fixtureTastes,catalogVersion,stockAsOf} from './catalog.mjs';
import {fail,validateRequest,refine} from './policy.mjs';
import {FixtureProvider,validateMapping} from './providers.mjs';
import {Planner,decide} from './agent.mjs';
import {DailyBudget} from './budget.mjs';
import {withSignal} from './http.mjs';
import {acquireRuntimeLock} from './runtime.mjs';
import {configuredQlooProvider} from './qloo-cli.mjs';
import {inspectCliRuntime} from './qloo-cli.mjs';
import {buildP00Plan} from './p00.mjs';
import {qlooOnlyReadiness} from './readiness.mjs';
import {currentLiveCodeFingerprint} from './live-evidence.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const apiMethods=new Map([['/api/bootstrap','GET'],['/api/search','GET'],['/api/decision','GET'],['/api/decide','POST'],['/api/refine','POST'],['/api/gift-card','POST']]);
export function createApp({mode='fixture',provider=new FixtureProvider(),planner=new Planner({enabled:false}),now=Date.now,maxSessions=200,decisionTimeoutMs=20000,searchTimeoutMs=mode==='qloo_only'?20000:7000}={}) {
  if(!['fixture','live','qloo_only'].includes(mode))throw Error('Choose fixture, live or qloo_only mode');
  if(mode==='qloo_only'&&(provider.source!=='qloo'||planner.enabled))throw Error('Qloo-only mode requires Qloo and a disabled LLM planner');
  const sessions=new Map();const knownWorks=new Set(catalog.map(e=>e.workKey));
  function getSession(req,res) {
    for(const [key,s]of sessions)if(s.expires<=now())sessions.delete(key);
    const cookie=(req.headers.cookie||'').split(';').find(c=>c.trim().startsWith('sb_session='))?.trim().slice(11);
    if(cookie&&sessions.has(cookie))return sessions.get(cookie);
    if(sessions.size>=maxSessions)throw fail('The demo is at capacity. Try again later.',503,'capacity');
    const token=randomBytes(32).toString('hex');
    const s={tastes:new Map(),request:null,decision:null,refinements:0,runs:0,searches:0,busy:false,expires:now()+30*60*1000};
    sessions.set(token,s);res.setHeader('Set-Cookie',`sb_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800${process.env.PUBLIC_HTTPS==='true'?'; Secure':''}`);return s;
  }
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&assets.has(url.pathname)) {const [file,type]=assets.get(url.pathname);res.writeHead(200,{'Content-Type':type});res.end(readFileSync(join(root,'public',file)));return;}
      if(req.method==='GET'&&url.pathname==='/api/health')return json(200,{ok:true,mode});
      const method=apiMethods.get(url.pathname);
      if(!method)throw fail('Page not found.',404);
      if(req.method!==method){res.setHeader('Allow',method);throw fail('Method not supported.',405);}
      // Searches spend provider calls; protect GET API requests as well as mutations.
      const origin=req.headers.origin;
      const expectedOrigin=`${process.env.PUBLIC_HTTPS==='true'?'https':'http'}://${req.headers.host}`;
      const site=req.headers['sec-fetch-site'];
      if((origin&&origin!==expectedOrigin)||(site&&!['same-origin','none'].includes(site)))throw fail('Cross-site requests are not allowed.',403);
      if(req.method==='POST') {
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw fail('Use a JSON request.',415);
      }
      const session=getSession(req,res);
      if(req.method==='GET'&&url.pathname==='/api/bootstrap')return json(200,{mode,agent:planner.enabled?'llm':'deterministic',catalog,catalogVersion,stockAsOf,presets:mode==='fixture'?fixtureTastes.slice(0,2):[],lastDecision:session.decision,refinementsLeft:2-session.refinements});
      if(req.method==='GET'&&url.pathname==='/api/search') {
        const query=url.searchParams.get('query')?.trim(),type=url.searchParams.get('type');
        if(!query||query.length>100||!['movie','artist','book'].includes(type))throw fail('Enter a title or artist, up to 100 characters.');
        if(session.searches>=20)throw fail('Search limit reached for this session.',429,'search_limit');
        session.searches++;
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(fail('Search timed out. Please try again.',504,'search_timeout')),searchTimeoutMs);
        const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnect);
        let results;
        try{results=await withSignal(provider.search(query,type,controller.signal),controller.signal);}
        finally{clearTimeout(timeout);res.removeListener('close',disconnect);}
        for(const t of results)session.tastes.set(t.id,t);
        return json(200,{results,source:provider.source});
      }
      if(req.method==='GET'&&url.pathname==='/api/decision')return json(200,{decision:session.decision});
      if(req.method==='POST'&&['/api/decide','/api/refine','/api/gift-card'].includes(url.pathname)) {
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12000)throw fail('Request too large.',413);chunks.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('Invalid JSON.');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Expected an object.');
        if(url.pathname==='/api/gift-card') {
          if(!session.decision||body.version!==session.decision.version||body.decisionId!==session.decision.id)throw fail('Choose from the latest decision.',409,'version_conflict');
          const c=session.decision.cards.find(c=>c.sku===body.sku);if(!c)throw fail('Choose a current recommendation.');
          const giftNote='Chosen with you in mind. I hope you enjoy this book.';
          return json(200,{title:c.title,author:c.author,sku:c.sku,priceMinor:c.priceMinor,format:c.format,note:c.note,giftNote,reason:c.reason,source:session.decision.source,inventory:'simulated',text:`A book for you\n${c.title}\nby ${c.author}\n\n${giftNote}\n\n${c.note}\n\n${c.format} · $${(c.priceMinor/100).toFixed(2)}\nDemo inventory: price and stock are simulated.\nNo purchase or reservation has been made.`});
        }
        if(session.busy)throw fail('A decision is already in progress. Wait for it to finish.',409,'version_conflict');
        if(session.runs>=6)throw fail('This session has used its six decision cycles.',429,'session_limit');
        let next;
        if(url.pathname==='/api/decide')next=validateRequest(body,session.tastes,knownWorks);
        else {if(!session.request||!session.decision)throw fail('Create a gift brief first.');if(body.decisionId!==session.decision.id)throw fail('This gift brief changed. Reload the latest decision.',409,'version_conflict');next=refine(session.request,body,session.decision.cards,session.refinements);}
        const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(fail('Decision timed out. The previous selection is still available.',504,'decision_timeout')),decisionTimeoutMs);
        const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.once('close',disconnect);
        session.busy=true;session.runs++;
        try {
          const previous=url.pathname==='/api/refine'?session.decision:null;
          const result=await withSignal(decide({request:next,tastes:next.tasteIds.map(id=>session.tastes.get(id)),provider,planner,previous,signal:controller.signal}),controller.signal);
          session.request=next;session.decision=result;
          session.refinements=url.pathname==='/api/refine'?session.refinements+1:0;
          return json(200,{decision:result,refinementsLeft:2-session.refinements});
        } finally {clearTimeout(timeout);res.removeListener('close',disconnect);session.busy=false;}
      }
      throw fail('Endpoint not found.',404);
    }catch(error){if(!res.destroyed)json(error.status||500,{error:error.status?error.message:'Unexpected server error.',code:error.code||'server_error'});}
  });
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const mode=process.env.SHELFBRIDGE_MODE||'fixture';if(!['fixture','live','qloo_only'].includes(mode))throw Error('Choose fixture, live or qloo_only mode');
  const runtime=join(root,'.runtime');const cleanup=acquireRuntimeLock(runtime,'server');
  process.on('exit',()=>{try{cleanup();}catch{}});
  const budget=new DailyBudget(runtime,Number(process.env.DAILY_PROVIDER_CALL_LIMIT||60));
  let mapping={};try{mapping=validateMapping(JSON.parse(readFileSync(join(root,'data','qloo-mapping.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(mode==='qloo_only'){
    const read=name=>{try{return JSON.parse(readFileSync(join(root,name),'utf8'));}catch{return null;}};
    const report=qlooOnlyReadiness({mapping,p00Plan:buildP00Plan(read('data/qloo-review.json')),p00:read('test-results/p00.json'),qlooOnlySmoke:read('test-results/qloo-only-smoke.json'),transportCheck:inspectCliRuntime(),liveCodeFingerprint:currentLiveCodeFingerprint()});
    if(!report.runtimeConfigurationReady||!report.liveIntegrationEvidenceReady)throw fail('Verify the current Qloo-only configuration and HTTP journey before starting.',503,'qloo_only_not_verified');
  }
  const provider=mode==='fixture'?new FixtureProvider():configuredQlooProvider({mapping,budget,approved:process.env.QLOO_CONTRACT_APPROVED==='true',requestTimeoutMs:mode==='qloo_only'?18000:7000});
  const planner=new Planner({key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||'gpt-4.1-mini',budget,enabled:mode==='live'});
  const app=createApp({mode,provider,planner});
  app.listen(Number(process.env.PORT||4318),process.env.HOST||'127.0.0.1',()=>console.log(`ShelfBridge listening on port ${process.env.PORT||4318} (${mode})`));
  for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>app.close(()=>process.exit(0)));
}
