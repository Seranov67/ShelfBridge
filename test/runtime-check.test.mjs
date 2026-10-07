import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {checkRuntime} from '../scripts/runtime-check.mjs';
function harness(t){const path=realpathSync(mkdtempSync(join(tmpdir(),'shelfbridge-recovery-')));assert.equal(dirname(path),realpathSync(tmpdir()));assert.ok(basename(path).startsWith('shelfbridge-recovery-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
const dead=()=>{throw Object.assign(Error(),{code:'ESRCH'});};
const owner={pid:12345,kind:'server',startedAt:'2026-10-07T16:00:00Z'};
test('Runtime recovery preserves a dead-owner record and is read-only by default',t=>{
  const dir=harness(t),raw=JSON.stringify(owner);writeFileSync(join(dir,'server.lock'),raw);
  assert.equal(checkRuntime(dir,{probe:dead}).state,'stale');assert.equal(readFileSync(join(dir,'server.lock'),'utf8'),raw);
  assert.equal(checkRuntime(dir,{probe:dead,releaseStale:true}).state,'released_stale');const archive=readdirSync(dir);assert.equal(archive.length,1);assert.equal(readFileSync(join(dir,archive[0]),'utf8'),raw);assert.equal(checkRuntime(dir).state,'unlocked');
});
test('Runtime recovery refuses active, unknown, changed and malformed owners',t=>{
  const dir=harness(t);writeFileSync(join(dir,'server.lock'),JSON.stringify(owner));
  assert.equal(checkRuntime(dir,{probe:()=>{},releaseStale:true}).state,'active');
  assert.equal(checkRuntime(dir,{probe:()=>{throw Object.assign(Error(),{code:'EPERM'});},releaseStale:true}).state,'owner_unknown');
  let calls=0;assert.equal(checkRuntime(dir,{releaseStale:true,probe:()=>{if(++calls===1)dead();}}).state,'active');assert.ok(readdirSync(dir).includes('server.lock'));
  assert.equal(checkRuntime(dir,{releaseStale:true,probe:()=>{writeFileSync(join(dir,'server.lock'),JSON.stringify({...owner,pid:54321}));dead();}}).state,'lock_changed');
  writeFileSync(join(dir,'server.lock'),'not JSON');assert.equal(checkRuntime(dir,{probe:dead,releaseStale:true}).state,'invalid_lock');assert.equal(readFileSync(join(dir,'server.lock'),'utf8'),'not JSON');
});
