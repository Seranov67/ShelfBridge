import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareBenchmark,benchmarkUnits,baselineCaptures,checkBenchmarkCaptures,blindBenchmark,summarizeBenchmark,assertBenchmark} from '../src/benchmark.mjs';
import {renderBenchmarkReview} from '../src/benchmark-review.mjs';

const example=()=>JSON.parse(readFileSync(new URL('../data/qloo-review.example.json',import.meta.url),'utf8'));
function reviewed(){const r=example();let n=1;const ids=new Map();const uuid=()=>`${String(n++).padStart(8,'0')}-1111-4111-8111-111111111111`;for(const w of r.works){w.identityReviewed=true;w.qlooEntityId=uuid();ids.set(w.title,w.qlooEntityId);}for(const p of r.profiles)for(const t of p.tastes){if(!ids.has(t.query))ids.set(t.query,uuid());t.identityReviewed=true;t.qlooEntityId=ids.get(t.query);}return r;}
const ready=()=>prepareBenchmark(reviewed());
// Synthetic outcomes only exist in memory; never write them as real evidence.
function mockCaptures(plan){return benchmarkUnits(plan).map(u=>u.method==='B0'?baselineCaptures(plan).find(c=>c.id===u.id):({id:u.id,state:u.shelf.length?'ready':'no_eligible_stock',workKeys:u.shelf.slice(0,3).map(e=>e.workKey),durationMs:20,calls:{qloo:u.shelf.length&&['B2','Full'].includes(u.method)?1:0,openai:u.shelf.length?(u.method==='B1'?1:u.method==='Full'?2:0):0},source:{B1:'openai',B2:'qloo',Full:'openai_qloo'}[u.method],model:['B1','Full'].includes(u.method)?plan.model:null,recordedAt:'2026-10-05T12:00:00.000Z'}));}
function rated(plan,captures,id='P01'){const {ratingsTemplate,key}=blindBenchmark(plan,captures,{participantId:id});const units=new Map(benchmarkUnits(plan).map(u=>[u.id,u]));return {...ratingsTemplate,consent:true,role:'buyer',ratings:ratingsTemplate.ratings.map(r=>{const u=units.get(key.entries.find(k=>k.blindId===r.blindId).unitId);return {...r,relevance:u.shelf.length?(u.method==='Full'?5:3):null};}),usability:{completed:true,assisted:false,elapsedSeconds:90}};}

test('Unreviewed benchmark stays blocked and contains only original B0 outcomes',()=>{
  const plan=prepareBenchmark(example());assert.equal(plan.state,'blocked');assert.equal(plan.liveQlooVerified,false);assert.equal(benchmarkUnits(plan).length,176);assert.equal(baselineCaptures(plan).length,22);assert.equal(plan.tasks.length,12);assert.ok(plan.tasks[0].initial.tastes.every(t=>t.entityId===null));
  assert.throws(()=>blindBenchmark(plan,baselineCaptures(plan),{participantId:'P01'}),/Resolve/);
});
test('Manifest freezing is deterministic and rejects altered/rehashed requests and catalog',()=>{
  const plan=ready();assert.equal(plan.fingerprint,ready().fingerprint);assert.notEqual(plan.fingerprint,prepareBenchmark(reviewed(),{seed:'another-seed'}).fingerprint);
  const changed=structuredClone(plan);changed.tasks[0].initial.request.budgetMinor=100000;assert.throws(()=>assertBenchmark(changed));
  const {fingerprint,source,state,liveQlooVerified,blockers,...protocol}=changed;changed.fingerprint=createHash('sha256').update(JSON.stringify(protocol)).digest('hex');assert.throws(()=>assertBenchmark(changed),/protocol/);
  const methodChange=structuredClone(plan);methodChange.methods[0].runs=2;assert.throws(()=>assertBenchmark(methodChange));assert.equal(ready().methods[0].runs,1);
});
test('Each method and stochastic run gets the same declared repair and shelf',()=>{
  const plan=ready();const units=benchmarkUnits(plan);for(const t of plan.tasks){const repairs=units.filter(u=>u.task===t.id&&u.phase==='repair');assert.equal(repairs.length,t.repair?8:0);if(repairs.length)for(const u of repairs){assert.deepEqual(u.request,repairs[0].request);assert.deepEqual(u.shelf,repairs[0].shelf);}}
  assert.ok(plan.tasks.filter(t=>t.repair?.kind==='exclude').every(t=>t.repair.request.excludedWorkKeys[0]===t.initial.shelf[0].workKey));
});
test('Incomplete, duplicated, invented, changed-baseline and excess-call captures cannot pass',()=>{
  const plan=ready(),captures=mockCaptures(plan);assert.equal(checkBenchmarkCaptures(plan,captures).invalid,0);assert.equal(checkBenchmarkCaptures(plan,captures.slice(1)).missing,1);assert.throws(()=>checkBenchmarkCaptures(plan,[captures[0],captures[0]]));
  for(const patch of [{workKeys:['fake']},{workKeys:[captures[0].workKeys[0],captures[0].workKeys[0]]},{source:'qloo'},{state:'no_eligible_stock',workKeys:[]},{calls:{qloo:1,openai:0}},{secret:'not-allowed'}]){const bad=structuredClone(captures);Object.assign(bad[0],patch);assert.ok(checkBenchmarkCaptures(plan,bad).invalid>0);}
  const bad=structuredClone(captures);bad.find(c=>c.id==='T11:Full:1:initial').calls.openai=1;assert.ok(checkBenchmarkCaptures(plan,bad).invalid>0);
  const shortLoop=structuredClone(captures);shortLoop.find(c=>c.id==='T01:Full:1:initial').calls.openai=1;assert.ok(checkBenchmarkCaptures(plan,shortLoop).invalid>0);
  const badTime=structuredClone(captures);badTime.find(c=>c.id==='T01:B1:1:initial').recordedAt='2026-02-30T12:00:00.000Z';assert.ok(checkBenchmarkCaptures(plan,badTime).invalid>0);
});
test('Observed failures remain visible and blind packets contain no method/source/model/identity metadata',()=>{
  const plan=ready(),captures=mockCaptures(plan);Object.assign(captures.find(c=>c.id==='T01:Full:1:initial'),{state:'failed',workKeys:[],failureCode:'source_unavailable'});
  assert.equal(checkBenchmarkCaptures(plan,captures).failures,1);const first=blindBenchmark(plan,captures,{participantId:'P01'}),again=blindBenchmark(plan,captures,{participantId:'P01'}),second=blindBenchmark(plan,captures,{participantId:'P02'});
  assert.deepEqual(first,again);assert.notDeepEqual(first.key.entries,second.key.entries);assert.equal(first.packet.items.length,176);assert.equal(first.ratingsTemplate.consent,false);
  for(const item of first.packet.items){assert.ok(!['method','source','model','unitId'].some(k=>k in item));for(const t of item.brief.tastes)assert.ok(!('entityId'in t));}
  assert.ok(!JSON.stringify(first.packet).includes('source_unavailable'));assert.throws(()=>blindBenchmark(plan,captures,{participantId:'real-name'}));
});
test('Paired metrics collapse repeat runs, retain missing ratings and never invent participants',()=>{
  const plan=ready(),captures=mockCaptures(plan);const assessment=rated(plan,captures);const report=summarizeBenchmark(plan,captures,[assessment]);
  assert.equal(report.participants,1);assert.equal(report.missingReadyRatings,0);assert.equal(report.comparisons[1].pairedCells,10);assert.equal(report.comparisons[1].medianFullMinusBaseline,2);assert.equal(report.repairs[0].medianRelevanceChange,0);assert.equal(report.usability.completedWithoutAssistance,1);assert.equal(report.liveQlooVerified,false);
  const missing=structuredClone(assessment);missing.ratings.forEach(r=>r.relevance=null);const partial=summarizeBenchmark(plan,captures,[missing]);assert.ok(partial.missingReadyRatings>0);assert.equal(partial.comparisons[0].medianFullMinusBaseline,null);
  const empty=summarizeBenchmark(plan,captures,[]);assert.equal(empty.qualityBenchmark,false);assert.equal(empty.participants,0);
});
test('Ratings require consent, original blinded packet, unique participants, no-stock abstention and valid scores',()=>{
  const plan=ready(),captures=mockCaptures(plan),a=rated(plan,captures);assert.throws(()=>summarizeBenchmark(plan,captures,[a,a]));
  for(const patch of [{consent:false},{packetFingerprint:'changed'},{role:'invented'},{usability:{completed:true,assisted:false,elapsedSeconds:-1}}])assert.throws(()=>summarizeBenchmark(plan,captures,[{...a,...patch}]));
  const bad=structuredClone(a);bad.ratings[0].relevance=6;assert.throws(()=>summarizeBenchmark(plan,captures,[bad]));
  const noStock=structuredClone(a);noStock.ratings.find(r=>r.relevance===null).relevance=4;assert.throws(()=>summarizeBenchmark(plan,captures,[noStock]));
  const duplicate=structuredClone(a);duplicate.ratings[1]=duplicate.ratings[0];assert.throws(()=>summarizeBenchmark(plan,captures,[duplicate]));
});
test('Offline questionnaire safely embeds untrusted text and never includes the private method key',()=>{
  const plan=ready(),captures=mockCaptures(plan),{packet,ratingsTemplate}=blindBenchmark(plan,captures,{participantId:'P01'});
  packet.items[0].brief.tastes[0].name='</script><script>untrusted()</script>\u2028';
  const html=renderBenchmarkReview(packet,ratingsTemplate);assert.ok(!html.includes('<script>untrusted()'));assert.ok(html.includes('\\u003c/script\\u003e'));assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes('unitId'));assert.ok(!html.includes('/*BENCHMARK_PAYLOAD*/'));
});
