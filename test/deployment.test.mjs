import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {createApp} from '../src/server.mjs';
import {vercelConfiguration} from '../scripts/build-vercel.mjs';
import {vercelEnvironment,createVercelHandler} from '../src/vercel-app.mjs';
import {ShelfBridgeTools,vercelBase} from '../scripts/mcp-tools.mjs';
import {createFunctionHandler} from '../api/handler.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
function checkout(t){
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-deployment-'));
  for(const name of ['src','public','data','scripts','api','package.json'])cpSync(join(root,name),join(dir,name),{recursive:true});
  t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}

test('Clean application launch defaults to Qloo-only and fails closed without live evidence',t=>{
  const dir=checkout(t);
  const child=spawnSync(process.execPath,[join(dir,'scripts/start.mjs')],{env:{},encoding:'utf8',timeout:10000});
  assert.equal(child.status,1);assert.match(child.stderr,/qloo_only_not_verified/);
  assert.doesNotMatch(child.stderr,/\.env: not found/);
  assert.equal(existsSync(join(dir,'.runtime','budget.json')),false);
  assert.equal(existsSync(join(dir,'.runtime','server.lock')),false);
});

test('Explicit fixture launch works without an env file even when Qloo-only is configured',async t=>{
  const dir=checkout(t),portServer=createServer();
  await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
  const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  const child=spawn(process.execPath,[join(dir,'scripts/start.mjs'),'--fixture'],{env:{SHELFBRIDGE_MODE:'qloo_only',PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  try {
    await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw Error('Launcher exited before listening.');})]);
    const health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    assert.equal(health.mode,'fixture');assert.equal(health.ok,true);
  }finally{child.kill('SIGTERM');await exited;}
  assert.equal(existsSync(join(dir,'.runtime','server.lock')),false);
});

test('Vercel build keeps the complete Function private and publishes only browser assets',t=>{
  const dir=checkout(t);
  // Only packaging is under test; the real installed CLI is checked separately.
  cpSync(join(root,'node_modules','@qloo','qloo-harness'),join(dir,'node_modules','@qloo','qloo-harness'),{recursive:true});
  const child=spawnSync(process.execPath,[join(dir,'scripts/build-vercel.mjs')],{env:{QLOO_API_KEY:'test-secret-never-publish'},encoding:'utf8',timeout:10000});
  assert.equal(child.status,0);
  const config=JSON.parse(readFileSync(join(dir,'.vercel','output','config.json')));
  assert.equal(config.version,3);assert.ok(config.routes.some(r=>r.dest==='/api/handler?sb_endpoint=$1'));
  assert.deepEqual(config,vercelConfiguration());
  assert.ok(config.routes.some(r=>r.headers?.['CDN-Cache-Control']==='no-store'));
  assert.doesNotMatch(JSON.stringify(config),/test-secret-never-publish/);
  for(const file of ['index.html','app.js','style.css'])assert.equal(readFileSync(join(dir,'.vercel','output','static',file),'utf8'),readFileSync(join(root,'public',file),'utf8'));
  for(const name of ['static/src','static/data','static/.env'])assert.equal(existsSync(join(dir,'.vercel','output',name)),false);
  const bundle=join(dir,'.vercel','output','functions','api','handler.func');
  const functionConfig=JSON.parse(readFileSync(join(bundle,'.vc-config.json')));
  assert.equal(functionConfig.runtime,'nodejs22.x');assert.equal(functionConfig.shouldAddHelpers,false);
  assert.equal(existsSync(join(bundle,functionConfig.handler)),true);
  assert.equal(existsSync(join(bundle,'src','redis-state.mjs')),true);
  assert.equal(existsSync(join(bundle,'.env')),false);
});

test('Vercel entrypoint requires genuine evidence and uses writable temporary CLI home',()=>{
  assert.throws(()=>createVercelHandler({env:{SHELFBRIDGE_MODE:'live'}}),/Qloo-only/);
  assert.throws(()=>createVercelHandler({env:{PUBLIC_ORIGIN:'https://shelfbridge.vercel.app'}}),/Verify the current/);
  const env=vercelEnvironment({SHELFBRIDGE_QLOO_HOME:'/readonly',QLOO_TRANSPORT:'http_legacy'});
  assert.equal(env.SHELFBRIDGE_QLOO_HOME,'/tmp/shelfbridge-qloo');assert.equal(env.QLOO_TRANSPORT,'cli');
});

test('Remote MCP requires an explicit exact Vercel origin and sends only its session cookie',async()=>{
  for(const url of ['http://shelfbridge.vercel.app','https://localhost','https://user:pass@shelfbridge.vercel.app','https://shelfbridge.vercel.app/path','https://shelfbridge.vercel.app/','https://shelfbridge.vercel.app.evil.example'])assert.throws(()=>vercelBase(url));
  const calls=[];const bridge=new ShelfBridgeTools({remoteBase:'https://shelfbridge.vercel.app',fetchImpl:async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':'sb_session=abc; Secure; HttpOnly'}});
  }});
  await bridge.api('/api/bootstrap');await bridge.api('/api/decision');
  assert.equal(calls[0].url,'https://shelfbridge.vercel.app/api/bootstrap');assert.equal(calls[1].options.headers.Cookie,'sb_session=abc');
  assert.equal(calls[0].options.redirect,'error');assert.equal(Object.hasOwn(calls[0].options.headers,'Authorization'),false);
  assert.throws(()=>new ShelfBridgeTools({base:'https://shelfbridge.vercel.app'}));
});

test('Function wrapper reconstructs an internal rewrite with its original query and body',async t=>{
  const handler=createFunctionHandler(()=>createApp().listeners('request')[0]);
  const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const result=await fetch(base+'/api/handler?sb_endpoint=search&query=Amelie&type=movie');
  assert.equal(result.status,200);const taste=(await result.json()).results[0];
  const cookie=result.headers.get('set-cookie').split(';')[0];
  const decision=await fetch(base+'/api/handler?sb_endpoint=decide',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({tasteIds:[taste.id],budgetMinor:2500})});
  assert.equal(decision.status,200);assert.equal((await decision.json()).decision.state,'ready');
  assert.equal((await fetch(base+'/api/handler?sb_endpoint=unexpected')).status,404);
});

test('Configured public origin works through a proxy Host and refuses another browser origin',async t=>{
  const publicOrigin='https://shelfbridge.example';
  const server=createApp({publicOrigin});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const result=await fetch(base+'/api/search?query=Amelie&type=movie',{headers:{Origin:publicOrigin,'Sec-Fetch-Site':'same-origin'}});
  assert.equal(result.status,200);const tastes=(await result.json()).results;
  const cookie=result.headers.get('set-cookie').split(';')[0];
  const decision=await fetch(base+'/api/decide',{method:'POST',headers:{Cookie:cookie,Origin:publicOrigin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({tasteIds:[tastes[0].id],budgetMinor:2500})});
  assert.equal(decision.status,200);assert.equal((await decision.json()).decision.state,'ready');
  const forged=await fetch(base+'/api/bootstrap',{headers:{Origin:'https://evil.example','X-Forwarded-Host':'shelfbridge.example','X-Forwarded-Proto':'https'}});
  assert.equal(forged.status,403);
  for(const value of ['https://shelfbridge.example/','https://shelfbridge.example/path','https://user:pass@shelfbridge.example','file:///tmp'])assert.throws(()=>createApp({publicOrigin:value}),/PUBLIC_ORIGIN/);
});
