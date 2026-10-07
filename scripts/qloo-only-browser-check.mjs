// Controlled UI rehearsal only. Never uses provider credentials or the live ledger.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {FixtureProvider} from '../src/providers.mjs';
import {Planner} from '../src/agent.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||'playwright');
const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const fixture=new FixtureProvider();let broken=false,calls=0;
const provider={source:'qloo',async search(...args){calls++;return fixture.search(...args);},async rank(...args){calls++;if(broken)throw Object.assign(Error('Controlled Qloo outage'),{status:503,code:'source_unavailable'});return {...await fixture.rank(...args),warning:'Controlled UI rehearsal, not live provider evidence.'};}};
const server=createApp({mode:'qloo_only',provider,planner:new Planner({enabled:false})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],errors=[];
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText('Live Qloo · no LLM · demo inventory',{exact:true}).waitFor();checks.push('qloo-only-label-before-first-decision');
  await page.locator('#sample').click();await page.getByText('Live identities need your confirmation.',{exact:false}).waitFor();assert.equal(await page.locator('.taste-chip').count(),0);assert.equal(calls,1);await page.locator('.search-result').first().click();checks.push('sample-requires-explicit-live-identity-selection');
  await page.locator('#taste-type').selectOption('artist');await page.locator('#taste-query').fill('AURORA');await page.locator('#search').click();await page.locator('.search-result').first().click();
  await page.locator('#generate').click();await page.locator('.card').first().waitFor();assert.equal(await page.locator('.card').count(),3);await page.getByText('Live Qloo ranking · deterministic workflow; no LLM. Inventory is simulated.',{exact:true}).waitFor();checks.push('qloo-only-decision-with-honest-workflow-label');
  assert.equal(await page.locator('.book-description').count(),3);assert.ok((await page.locator('.book-description').allTextContents()).every(text=>text.length>0));checks.push('qloo-only-cards-include-catalog-descriptions');
  await page.locator('#evidence summary').click();await page.getByText('Deterministic workflow · no LLM',{exact:true}).waitFor();assert.ok(!(await page.locator('#evidence-content').textContent()).includes('LLM tool loop'));checks.push('evidence-distinguishes-qloo-from-llm');
  const rejected=await page.locator('.card h3').first().textContent();await page.getByRole('button',{name:'Already owned / exclude'}).first().click();await page.getByRole('button',{name:'Confirm & rebuild'}).click();await page.getByText('Selection rebuilt · v1 → v2').waitFor();assert.ok(!(await page.locator('.card h3').allTextContents()).includes(rejected));
  await page.locator('#new-budget').fill('15');await page.locator('#lower-budget').click();await page.getByRole('button',{name:'Confirm & rebuild'}).click();await page.getByText('Selection rebuilt · v2 → v3').waitFor();assert.ok((await page.locator('.book-facts strong').allTextContents()).every(p=>Number(p.replace('$',''))<=15));checks.push('confirmed-exclusion-and-budget-preserve-boundaries');
  const selectedDescription=await page.locator('.book-description').first().textContent();await page.getByRole('button',{name:'Choose this gift'}).first().click();await page.getByRole('dialog',{name:'Gift card',exact:true}).waitFor();assert.match(await page.locator('#gift-content').textContent(),/Based on a live Qloo ranking/);assert.match(await page.locator('#gift-content').textContent(),/No purchase or reservation/);assert.equal(await page.locator('.gift-description').textContent(),selectedDescription);assert.doesNotMatch(await page.locator('.gift-note').textContent(),/Ranked #|Teaching example/);await page.locator('#close-gift').click();checks.push('gift-card-retains-source-and-simulated-inventory');
  const beforeReload=calls;await page.reload();await page.locator('.card').first().waitFor();await page.getByText('Live Qloo · no LLM · demo inventory',{exact:true}).waitFor();assert.equal(calls,beforeReload);assert.equal(Number(await page.locator('#budget').inputValue()),15);checks.push('reload-restores-qloo-only-selection-without-calls');
  const saved=await page.locator('.card h3').allTextContents();broken=true;await page.locator('#budget').fill('20');await page.locator('#generate').click();await page.getByText('Controlled Qloo outage',{exact:true}).waitFor();assert.deepEqual(await page.locator('.card h3').allTextContents(),saved);assert.equal(await page.getByRole('button',{name:'Choose this gift'}).first().isDisabled(),true);await page.getByRole('button',{name:'Refresh saved selection',exact:true}).click();await page.getByText('Saved selection loaded.',{exact:false}).waitFor();assert.equal(Number(await page.locator('#budget').inputValue()),15);checks.push('provider-outage-preserves-saved-selection');
  await page.setViewportSize({width:320,height:760});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,'qloo-only-controlled-mobile.png'),fullPage:true});checks.push('320px-no-horizontal-overflow');
  assert.deepEqual(errors,[]);writeFileSync(join(out,'qloo-only-browser-report.json'),JSON.stringify({checkedAt:new Date().toISOString(),source:'controlled_qloo_only_ui',checks,errors,providerCallsReserved:0,liveQlooVerified:false},null,2));console.log(JSON.stringify({passed:checks.length,errors,providerCallsReserved:0,liveQlooVerified:false}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
