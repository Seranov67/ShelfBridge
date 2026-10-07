import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {fail} from './policy.mjs';
// Single-process durable reservations. Reserve before a provider call, including failures.
// Runtime directory must live on a persistent volume. Multi-replica use is prohibited.
export class DailyBudget {
  constructor(dir,limit=60) {if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid daily limit');this.dir=dir;this.limit=limit;mkdirSync(dir,{recursive:true});this.path=join(dir,'budget.json');}
  snapshot() {
    let ledger;
    try {ledger=JSON.parse(readFileSync(this.path,'utf8'));}
    catch(e) {if(e.code!=='ENOENT')throw fail('The usage ledger needs operator attention.',503,'budget_limited');ledger={day:'',calls:0};}
    if (!ledger || typeof ledger.day!=='string' || !Number.isInteger(ledger.calls) || ledger.calls<0) throw fail('Invalid usage ledger.',503,'budget_limited');
    const day=new Date().toISOString().slice(0,10);
    if(ledger.day!==day)ledger={day,calls:0};
    return ledger;
  }
  remaining() {return Math.max(0,this.limit-this.snapshot().calls);}
  reserve(provider) {
    const ledger=this.snapshot();
    if(ledger.calls>=this.limit)throw fail('Today’s demo call limit has been reached. Please return tomorrow.',429,'budget_limited');
    ledger.calls++;ledger.lastProvider=provider;
    writeFileSync(this.path+'.tmp',JSON.stringify(ledger),{mode:0o600});renameSync(this.path+'.tmp',this.path);
    return ledger.calls;
  }
}
