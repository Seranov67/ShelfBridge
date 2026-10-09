import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {FixtureProvider} from '../src/providers.mjs';
import {RedisRest,RedisDailyBudget,RedisSessionStore} from '../src/redis-state.mjs';
import {localRedis} from './helpers/redis-client.mjs';

const url=process.env.SHELFBRIDGE_TEST_REDIS_URL;
const integration={skip:!url};
const namespace=()=>`test_${randomBytes(12).toString('hex')}`;
const fixtureSession=(redis,ns,options)=>new RedisSessionStore(redis,ns,options);
async function app(t,store,provider=new FixtureProvider()){
  const server=createApp({sessionStore:store,provider});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}`;
}

test('Redis REST failures are bounded, never retried, and hide storage credentials',async()=>{
  let calls=0;
  const redis=new RedisRest({url:'https://example.upstash.io',token:'test-private',fetchImpl:async()=>{calls++;throw Error('test-private');}});
  await assert.rejects(redis.command(['PING']),e=>e.status===503&&!e.message.includes('test-private'));
  assert.equal(calls,1);
  for(const bad of ['http://example.upstash.io','https://user:pass@example.upstash.io','https://example.upstash.io/','https://evil.example'])assert.throws(()=>new RedisRest({url:bad,token:'x'}));
});

test('Redis daily cap stays atomic across replicas, fresh processes, and changed limits',integration,async()=>{
  const redis=localRedis(url),ns=namespace(),a=new RedisDailyBudget(redis,ns,7),b=new RedisDailyBudget(redis,ns,7);
  const attempts=await Promise.allSettled(Array.from({length:40},(_,i)=>(i%2?a:b).reserve('qloo')));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,7);
  assert.ok(attempts.filter(a=>a.status==='rejected').every(a=>a.reason.code==='budget_limited'));
  await assert.rejects(new RedisDailyBudget(redis,ns,60).reserve('qloo'),e=>e.status===429);
  assert.equal(await redis.command(['HGET',a.key,'calls']),'7');
  // Provider failures consume the already reserved attempt, with no refund.
  await redis.command(['HSET',a.key,'day','1','calls','7','limit','7']);
  assert.equal(await b.reserve('qloo'),1);assert.equal(await redis.command(['HGET',a.key,'calls']),'1');
});

test('Redis sessions preserve tastes and choices across independent HTTP instances',integration,async t=>{
  const redis=localRedis(url),ns=namespace();
  const first=await app(t,fixtureSession(redis,ns)),second=await app(t,fixtureSession(redis,ns));
  const search=await fetch(first+'/api/search?query=Amelie&type=movie');assert.equal(search.status,200);
  const cookie=search.headers.get('set-cookie').split(';')[0],taste=(await search.json()).results[0];
  const headers={Cookie:cookie,'Content-Type':'application/json'};
  const response=await fetch(second+'/api/decide',{method:'POST',headers,body:JSON.stringify({tasteIds:[taste.id],budgetMinor:2500})});
  assert.equal(response.status,200);const decision=(await response.json()).decision;
  const refine=await fetch(first+'/api/refine',{method:'POST',headers,body:JSON.stringify({kind:'budget',budgetMinor:1500,decisionId:decision.id,version:decision.version})});
  assert.equal(refine.status,200);const refined=(await refine.json()).decision;
  const fresh=await app(t,fixtureSession(redis,ns));
  const restored=await (await fetch(fresh+'/api/bootstrap',{headers})).json();
  assert.deepEqual(restored.lastDecision,refined);assert.equal(restored.refinementsLeft,1);
  const gift=await fetch(second+'/api/gift-card',{method:'POST',headers,body:JSON.stringify({sku:refined.cards[0].sku,version:refined.version,decisionId:refined.id})});
  assert.equal(gift.status,200);assert.equal((await gift.json()).priceMinor,refined.cards[0].priceMinor);
});

test('Local budget migration preserves current spending without lowering existing reservations',integration,async()=>{
  const redis=localRedis(url),budget=new RedisDailyBudget(redis,namespace(),10),day=new Date().toISOString().slice(0,10);
  assert.deepEqual(await budget.importLocal({day,calls:4}),[1,4,10]);
  assert.equal(await budget.reserve('qloo'),5);
  assert.deepEqual(await budget.importLocal({day,calls:2}),[1,5,10]);
  assert.deepEqual(await budget.importLocal({day:'2000-01-01',calls:100}),[0,'different_utc_day']);
  assert.deepEqual(await budget.importLocal({day,calls:10}),[1,10,10]);
  await assert.rejects(budget.reserve('qloo'),e=>e.status===429);
});

test('Session lease excludes concurrent writers and fences a crashed or stale owner',integration,async()=>{
  const redis=localRedis(url),ns=namespace(),first=fixtureSession(redis,ns),second=fixtureSession(redis,ns);
  const lease=await first.acquire();lease.session.searches=4;await lease.save();
  await assert.rejects(second.acquire(lease.token),e=>e.status===409&&e.code==='version_conflict');
  // Simulate a Function disappearing: only its lease expires; saved quotas survive.
  await redis.command(['DEL',`${first.prefix}:lease:${lease.token}`]);
  const replacement=await second.acquire(lease.token);assert.equal(replacement.session.searches,4);
  lease.session.searches=1;await assert.rejects(lease.save(),e=>e.code==='session_expired');
  await lease.release();await assert.rejects(first.acquire(lease.token),e=>e.status===409);
  replacement.session.searches=5;await replacement.save();await replacement.release();
  const restored=await first.acquire(lease.token);assert.equal(restored.session.searches,5);await restored.release();
});

test('Shared capacity, session creation limits, and expired-token rotation cannot be bypassed by new cookies',integration,async()=>{
  const redis=localRedis(url),ns=namespace(),store=fixtureSession(redis,ns,{maxSessions:1,maxNewSessionsPerHour:2});
  const first=await store.acquire('a'.repeat(64));assert.notEqual(first.token,'a'.repeat(64));await first.release();
  await assert.rejects(store.acquire(),e=>e.code==='capacity');
  await redis.command(['DEL',`${store.prefix}:session:${first.token}`]);
  await redis.command(['ZREM',`${store.prefix}:sessions`,first.token]);
  const next=await store.acquire(first.token);assert.notEqual(next.token,first.token);await next.release();
  await redis.command(['DEL',`${store.prefix}:session:${next.token}`]);await redis.command(['ZREM',`${store.prefix}:sessions`,next.token]);
  await assert.rejects(store.acquire(),e=>e.code==='session_creation_limit');
});

test('A failed provider search is saved before failure and counts against the next replica',integration,async t=>{
  const redis=localRedis(url),ns=namespace(),store=fixtureSession(redis,ns);
  const provider=new FixtureProvider();let calls=0;provider.search=async()=>{calls++;throw Error('controlled provider failure');};
  const first=await app(t,store,provider),second=await app(t,fixtureSession(redis,ns),provider);
  const lease=await store.acquire();lease.session.searches=19;await lease.save();await lease.release();
  const headers={Cookie:`sb_session=${lease.token}`};
  assert.equal((await fetch(first+'/api/search?query=Amelie&type=movie',{headers})).status,500);
  const limited=await fetch(second+'/api/search?query=Amelie&type=movie',{headers});
  assert.equal(limited.status,429);assert.equal((await limited.json()).code,'search_limit');assert.equal(calls,1);
});
