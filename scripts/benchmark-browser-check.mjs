// Questionnaire rehearsal only: synthetic data never enters the benchmark folder.
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {renderBenchmarkReview} from '../src/benchmark-review.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH||'playwright');
const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const packet={participantId:'P01',items:[{blindId:'C001',task:'T01',phase:'initial',brief:{budgetMinor:2500,tastes:[{name:'Amélie',type:'movie'}],unavailableTitle:'Unavailable book',excludedTitles:[]},state:'ready',cards:[{title:'</script><img src="https://invalid.test/x" onerror="window.injected=true">',author:'Test author',note:'Browser rehearsal only',priceMinor:1400,format:'Simulated paperback',stockCount:2}]},{blindId:'C002',task:'T01',phase:'repair',brief:{budgetMinor:100,tastes:[{name:'Amélie',type:'movie'}],unavailableTitle:'Unavailable book',excludedTitles:[]},state:'no_eligible_stock',cards:[]}]};
const ratingsTemplate={participantId:'P01',packetFingerprint:'questionnaire-rehearsal',consent:false,role:null,ratings:packet.items.map(i=>({blindId:i.blindId,relevance:null})),usability:null};
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const page=await browser.newPage({viewport:{width:320,height:800}}),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
try {
  await page.setContent(renderBenchmarkReview(packet,ratingsTemplate));
  await page.getByText(packet.items[0].cards[0].title,{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(requests.length,0);checks.push('embedded-data-remains-text-with-zero-network-requests');
  await page.getByRole('button',{name:'Download anonymous answers'}).click();await page.getByText('Confirm voluntary consent and select your role before exporting.').waitFor();checks.push('export-requires-voluntary-consent-and-role');
  await page.locator('#consent').check();await page.locator('#role').selectOption('buyer');await page.locator('#rating').selectOption('4');await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('#rating').isDisabled(),true);await page.getByRole('button',{name:'Previous',exact:true}).click();assert.equal(await page.locator('#rating').inputValue(),'4');checks.push('ratings-survive-navigation-and-no-stock-cannot-be-rated');
  await page.locator('#observed').check();await page.getByRole('button',{name:'Download anonymous answers'}).click();await page.getByText('Enter elapsed seconds between 0 and 7200, or uncheck the app task report.').waitFor();await page.locator('#elapsed').fill('95');await page.locator('#completed').check();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download anonymous answers'}).click();const download=await downloading;const answers=JSON.parse(readFileSync(await download.path(),'utf8'));assert.equal(answers.ratings[0].relevance,4);assert.equal(answers.ratings[1].relevance,null);assert.equal(answers.usability.completed,true);assert.equal(answers.usability.assisted,false);assert.equal(answers.usability.elapsedSeconds,95);checks.push('export-retains-anonymous-ratings-and-explicit-usability-report');
  await page.goto('about:blank');await page.setContent(renderBenchmarkReview(packet,ratingsTemplate));await page.locator('#import').setInputFiles({name:'P01-ratings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(answers))});await page.getByText('Saved answers restored.').waitFor();assert.equal(await page.locator('#rating').inputValue(),'4');assert.equal(await page.locator('#consent').isChecked(),true);assert.equal(await page.locator('#elapsed').inputValue(),'95');checks.push('saved-answers-import-restores-progress');
  await page.locator('#import').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...answers,packetFingerprint:'wrong'}))});await page.getByText('Could not import: use the original answers file for this participant and packet.').waitFor();assert.equal(await page.locator('#rating').inputValue(),'4');checks.push('mismatched-import-does-not-overwrite-current-answers');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('320px-questionnaire-has-no-horizontal-overflow');await page.screenshot({path:join(out,'benchmark-review-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const report={source:'synthetic_questionnaire_rehearsal',checks,errors,providerCalls:0,qualityBenchmark:false,liveQlooVerified:false};writeFileSync(join(out,'benchmark-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,errors:errors.length,providerCalls:0,qualityBenchmark:false}));
}finally{await browser.close();}
