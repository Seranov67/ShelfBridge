// Captioned fixture walkthrough; no credentials or external provider calls.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,existsSync,copyFileSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const require=createRequire(import.meta.url);
const localPackage=join(root,'.tools','runtime','node_modules','playwright');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||(existsSync(localPackage)?localPackage:'playwright'));
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'test-results','demo');mkdirSync(out,{recursive:true});
const server=createApp();
let browser,context;
const errors=[],scenes=[];
let externalRequests=0;
const started=Date.now();
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||(existsSync(chrome)?chrome:undefined)});
  context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1080},recordVideo:{dir:out,size:{width:1440,height:1080}}});
  await context.route('**/*',async route=>{
    if(new URL(route.request().url()).origin!==base){externalRequests++;await route.abort();}
    else if(new URL(route.request().url()).pathname==='/demo-caption.css')await route.fulfill({contentType:'text/css',body:`html{scroll-behavior:auto!important}body{padding-bottom:112px}#demo-caption{position:fixed;bottom:0;left:0;right:0;z-index:100000;background:#173c38;color:#fffdf5;padding:17px 48px;box-shadow:0 -3px 14px #0002;font:20px/1.4 'Segoe UI',Arial,sans-serif;pointer-events:none}#demo-caption small{display:block;color:#ddd9bf;font-size:12px;letter-spacing:1px;margin-bottom:5px}#demo-caption p{margin:0}`});
    else await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const video=page.video();
  await page.goto(base);await page.getByText('Teaching demo · Qloo offline',{exact:true}).waitFor();
  await page.addStyleTag({url:`${base}/demo-caption.css`});
  await page.evaluate(()=>{
    const bar=document.createElement('aside');bar.id='demo-caption';
    const label=document.createElement('small');label.textContent='SHELFBRIDGE · FIXTURE WALKTHROUGH · SIMULATED INVENTORY · NO LIVE PROVIDER CALLS';
    bar.append(label,document.createElement('p'));document.body.append(bar);
  });
  async function caption(text){scenes.push({atMs:Date.now()-started,text});await page.locator('#demo-caption p').evaluate((node,value)=>node.textContent=value,text);}
  const hold=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await caption('ShelfBridge helps you find a thoughtful gift when your first-choice book is unavailable.');
  await page.screenshot({path:join(out,'01-home.png')});await hold(10000);
  await page.getByRole('button',{name:'Try a gift rescue'}).click();
  await page.getByText('Sample brief: Amélie + AURORA',{exact:false}).waitFor();
  await page.locator('.workspace').evaluate(node=>node.scrollIntoView({block:'start'}));
  await caption("Start with the recipient's confirmed films and music, an unavailable book, and a $25 budget.");
  assert.equal(await page.locator('.taste-chip').count(),2);await hold(14000);
  await page.locator('#generate').click();await page.locator('.card').first().waitFor();
  assert.equal(await page.locator('.card').count(),3);
  await caption('The shortlist stays within the available shelf and budget. Prices and stock are simulated.');
  await page.screenshot({path:join(out,'02-shortlist.png')});await hold(13000);
  const excluded=await page.locator('.card h3').first().textContent();
  await caption('Already owned? Confirm the exclusion. Every edition of that book leaves the eligible shelf.');
  await page.getByRole('button',{name:'Already owned / exclude'}).first().click();await hold(5000);
  await page.getByRole('button',{name:'Confirm & rebuild'}).click();await page.getByText('Selection rebuilt · v1 → v2').waitFor();
  assert.ok(!(await page.locator('.card h3').allTextContents()).includes(excluded));await hold(9000);
  await caption('Lower the maximum to $15. The system rebuilds the selection without raising your budget.');
  await page.locator('#new-budget').fill('15');await page.locator('#lower-budget').click();await hold(5000);
  await page.getByRole('button',{name:'Confirm & rebuild'}).click();await page.getByText('Selection rebuilt · v2 → v3').waitFor();
  const prices=await page.locator('.book-facts strong').allTextContents();
  assert.ok(prices.length&&prices.every(price=>Number(price.replace('$',''))<=15));
  assert.equal(Number(await page.locator('#budget').inputValue()),15);await hold(9000);
  await caption('Inspect the source, tastes, shelf boundary and decision trail. This recording uses fixture data.');
  await page.locator('#evidence summary').click();await page.locator('#evidence').evaluate(node=>node.scrollIntoView({block:'center'}));
  assert.match(await page.locator('#evidence-content').textContent(),/Teaching fixture — no Qloo API call/);
  assert.match(await page.locator('#evidence-content').textContent(),/Deterministic teaching workflow/);
  await page.screenshot({path:join(out,'03-evidence.png')});await hold(12000);
  await caption('Choose a book and keep a gift note. No purchase or reservation is made.');
  await page.getByRole('button',{name:'Choose this gift'}).first().click();
  await page.getByRole('dialog',{name:'Gift card',exact:true}).waitFor();
  await page.evaluate(()=>document.getElementById('gift-dialog').append(document.getElementById('demo-caption')));
  assert.match(await page.locator('#gift-dialog').textContent(),/No purchase or reservation/);
  await page.screenshot({path:join(out,'04-gift-card.png')});await hold(14000);
  await page.getByRole('button',{name:'Close gift card'}).click();await page.evaluate(()=>document.body.append(document.getElementById('demo-caption')));await page.locator('#results-title').evaluate(node=>node.scrollIntoView({block:'start'}));
  await caption('Real Qloo controls passed separately. The complete Qloo + OpenAI journey still needs verification.');await hold(8000);
  assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
  await context.close();context=null;
  const raw=await video.path();const target=join(out,'shelfbridge-fixture-demo.webm');copyFileSync(raw,target);unlinkSync(raw);
  writeFileSync(join(out,'recording-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),state:'passed',source:'fixture',language:'en',audio:false,externalRequests,liveQlooVerified:false,liveEndToEndVerified:false,excludedTitle:excluded,finalPrices:prices,errors,scenes,elapsedMs:Date.now()-started,video:target},null,2));
  console.log(JSON.stringify({state:'passed',source:'fixture',language:'en',externalRequests,video:target,scenes:scenes.length}));
}finally{
  if(context)await context.close();if(browser)await browser.close();
  if(server.listening)await new Promise(resolve=>server.close(resolve));
}
