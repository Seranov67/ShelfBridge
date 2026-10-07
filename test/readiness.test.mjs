import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readinessReport,mappingCoverage} from '../src/readiness.mjs';
import {catalog} from '../src/catalog.mjs';
import {withRuntimeLock,acquireRuntimeLock} from '../src/runtime.mjs';
import {evaluateFixtures,hardConstraintViolations} from '../src/evaluation.mjs';
import {plannerFailure} from '../src/provider-errors.mjs';
import {Planner} from '../src/agent.mjs';
import {compileReview} from '../src/review.mjs';

const reviewTemplate=()=>JSON.parse(readFileSync(new URL('../data/qloo-review.example.json',import.meta.url),'utf8'));

const completeMapping=()=>Object.fromEntries([...new Set(catalog.map(e=>e.workKey))].map((key,i)=>[key,`11111111-1111-1111-1111-${String(i).padStart(12,'0')}`]));

test('Preflight does not disclose keys or claim release readiness from configuration',()=>{
  const env={QLOO_API_KEY:'secret-qloo',OPENAI_API_KEY:'secret-openai',QLOO_CONTRACT_APPROVED:'true'};
  const report=readinessReport({env,mapping:completeMapping(),transportCheck:{kind:'cli',ready:true}});assert.equal(report.runtimeConfigurationReady,true);assert.equal(report.liveIntegrationEvidenceReady,false);assert.equal(report.releaseReady,false);assert.ok(!JSON.stringify(report).includes('secret-'));
});

test('Coverage threshold alone cannot enable a shelf with unmapped eligible books',()=>{
  const mapping=completeMapping();delete mapping.piranesi;delete mapping.earthsea;delete mapping.hobbit;delete mapping.thursday;delete mapping.ocean;delete mapping.martian;
  const coverage=mappingCoverage(mapping);assert.equal(coverage.mappedWorks,24);assert.equal(coverage.coverageTargetMet,true);assert.ok(coverage.missingEligibleWorks.length>0);
  assert.equal(readinessReport({env:{QLOO_API_KEY:'configured',OPENAI_API_KEY:'configured',QLOO_CONTRACT_APPROVED:'true'},mapping}).runtimeConfigurationReady,false);
  assert.equal(mappingCoverage({piranesi:'fixture:piranesi'}).valid,false);
});

test('Blank and placeholder keys, malformed limits and stale-model evidence do not pass',()=>{
  for(const key of ['', ' ', '<KEY>'])assert.equal(readinessReport({env:{QLOO_API_KEY:key,OPENAI_API_KEY:key}}).checks.qlooKeyConfigured,false);
  const report=readinessReport({env:{DAILY_PROVIDER_CALL_LIMIT:'NaN',OPENAI_MODEL:'different'},plannerSmoke:{state:'passed',model:'gpt-4.1-mini',agent:'llm_tool_loop'}});
  assert.equal(report.checks.dailyLimitValid,false);assert.equal(report.evidence.plannerSmokePassed,false);
});

test('Shared runtime lock blocks concurrent reservations and releases on failure',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'shelfbridge-lock-'));
  try {
    await assert.rejects(withRuntimeLock(dir,'test',async()=>{const metadata=JSON.parse(readFileSync(join(dir,'server.lock'),'utf8'));assert.equal(metadata.pid,process.pid);assert.throws(()=>acquireRuntimeLock(dir),{code:'runtime_locked'});throw Error('failed check');}),/failed check/);
    assert.equal(existsSync(join(dir,'server.lock')),false);const release=acquireRuntimeLock(dir);release();release();
  }finally{rmSync(dir,{recursive:true});}
});

test('All twelve predeclared fixture tasks and ten repairs respect hard constraints',async()=>{
  const report=await evaluateFixtures();assert.equal(report.tasks,12);assert.equal(report.repairs,10);assert.equal(report.noStockTasks,2);assert.equal(report.hardConstraintViolations,0);assert.equal(report.qualityBenchmark,false);assert.equal(report.source,'fixture');assert.ok(report.results.slice(-2).every(r=>r.fixtureRankCalls===0));
  assert.ok(hardConstraintViolations({budgetMinor:2500,cards:[{workKey:'fake'}]},{budgetMinor:2500,excludedWorkKeys:[]}).includes('ineligible_work'));
});

test('429 diagnostics distinguish billing, transient rate limits and unknown causes without retaining raw prose',async()=>{
  for(const [code,type,kind]of [['insufficient_quota','insufficient_quota','billing_or_quota'],['credit_balance_exhausted','insufficient_quota','billing_or_quota'],['project_spend_limit_exceeded','insufficient_quota','billing_or_quota'],['rate_limit_exceeded','rate_limit_error','rate_limit'],['slow_down','rate_limit_error','rate_limit'],['secret-key-injected','secret-type','unknown_429']]){
    const error=await plannerFailure(Response.json({error:{code,type,message:'SECRET RAW MESSAGE'}},{status:429,headers:{'Retry-After':'12'}}));
    assert.equal(error.failureKind,kind);assert.equal(error.retryAfterSeconds,12);assert.equal(error.providerStatus,429);assert.ok(!JSON.stringify(error).includes('SECRET'));assert.ok(!JSON.stringify(error).includes('secret-key'));
  }
});

test('Planner preserves safe live error categories and does not retry billing failures',async()=>{
  let calls=0;const planner=new Planner({key:'test',enabled:true,budget:{reserve(){}},fetchImpl:async()=>{calls++;return Response.json({error:{code:'insufficient_quota',type:'insufficient_quota',message:'never expose this'}},{status:429});}});
  await assert.rejects(planner.run({},()=>{},()=>{},undefined,[]),{code:'planner_unavailable',providerStatus:429,failureKind:'billing_or_quota'});assert.equal(calls,1);
});

test('Unreviewed identities never turn into mappings or approved P00 evidence',()=>{
  const review=reviewTemplate();review.works[0].qlooEntityId='11111111-1111-1111-1111-111111111111';
  const result=compileReview(review);assert.equal(result.ready,false);assert.equal(result.reviewedProfiles,0);assert.deepEqual(result.mapping,{});
});

test('Manually reviewed complete identities compile without approving the live contract',()=>{
  const review=reviewTemplate();const mapping=completeMapping();
  for(const work of review.works){work.identityReviewed=true;work.qlooEntityId=mapping[work.workKey];}
  let n=100;const identities=new Map();for(const profile of review.profiles)for(const taste of profile.tastes){taste.identityReviewed=true;const book=taste.type==='book'?catalog.find(e=>e.title===taste.query):null;if(!identities.has(taste.query))identities.set(taste.query,book?mapping[book.workKey]:`22222222-2222-2222-2222-${String(n++).padStart(12,'0')}`);taste.qlooEntityId=identities.get(taste.query);}
  const result=compileReview(review);assert.equal(result.ready,true);assert.equal(result.reviewedProfiles,10);assert.equal(result.coverage.mappedWorks,30);assert.equal(readinessReport({mapping:result.mapping}).checks.qlooContractApproved,false);
});

test('Fabricated, duplicate and mismatched reviewed identities cannot compile',()=>{
  const badId=reviewTemplate();badId.works[0].identityReviewed=true;badId.works[0].qlooEntityId='fixture:fake';assert.throws(()=>compileReview(badId));
  const identity=reviewTemplate();identity.works[0].author='different author';assert.throws(()=>compileReview(identity));
  const duplicate=reviewTemplate();duplicate.works.push(duplicate.works[0]);assert.throws(()=>compileReview(duplicate));
  const profile=reviewTemplate();profile.profiles[0].tastes[0].query='not predeclared';assert.throws(()=>compileReview(profile));
  const wrongType=reviewTemplate();wrongType.profiles[0].tastes[0].type='book';assert.throws(()=>compileReview(wrongType));
});
