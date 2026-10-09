// Build Output API: private Node Function + three public browser assets.
import {mkdirSync,copyFileSync,writeFileSync,cpSync,rmSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function vercelConfiguration(){
  const headers={'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
  return {version:3,routes:[{src:'/(.*)',headers,continue:true},
    {src:'/api/(bootstrap|health|search|decision|decide|refine|gift-card)',dest:'/api/handler?sb_endpoint=$1'},
    {handle:'filesystem'},{src:'/(.*)',status:404}]};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'.vercel','output');
  const installed=JSON.parse(readFileSync(join(root,'node_modules','@qloo','qloo-harness','package.json'),'utf8'));
  if(installed.version!=='0.1.26')throw Error('Run npm ci: the Vercel Function needs Qloo harness 0.1.26.');
  rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'static'),{recursive:true});
  for(const file of ['index.html','app.js','style.css'])copyFileSync(join(root,'public',file),join(out,'static',file));
  const bundle=join(out,'functions','api','handler.func');mkdirSync(bundle,{recursive:true});
  for(const name of ['api','src','data','public','node_modules'])cpSync(join(root,name),join(bundle,name),{recursive:true,dereference:true});
  copyFileSync(join(root,'package.json'),join(bundle,'package.json'));
  writeFileSync(join(bundle,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'api/handler.mjs',launcherType:'Nodejs',shouldAddHelpers:false,maxDuration:60},null,2)+'\n');
  writeFileSync(join(out,'config.json'),JSON.stringify(vercelConfiguration(),null,2)+'\n');
  console.log('Built ShelfBridge UI and Qloo-only Node Function for Vercel. Shared Upstash state and live configuration are required to activate it.');
}
