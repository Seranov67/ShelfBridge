import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {eligibleEditions} from './catalog.mjs';

export function currentLiveCodeFingerprint() {
  const src=dirname(fileURLToPath(import.meta.url));const hash=createHash('sha256');
  for(const file of readdirSync(src).filter(f=>f.endsWith('.mjs')).sort())hash.update(file).update(readFileSync(join(src,file)));
  return hash.digest('hex');
}
export function liveEvidenceMatches(report,{model,planFingerprint,codeFingerprint,tasteIds}) {
  if(!report||report.state!=='passed'||report.source!=='live_qloo_openai_http'||report.liveEndToEndVerified!==true||report.liveQlooVerified!==true||report.model!==model||!Number.isInteger(report.providerCallsReserved)||report.providerCallsReserved<1||report.providerCallsReserved>14)return false;
  return journeyChecksMatch(report,{planFingerprint,codeFingerprint,tasteIds});
}
function journeyChecksMatch(report,{planFingerprint,codeFingerprint,tasteIds}) {
  const ids=['bootstrap','confirmed_searches','initial_decision','confirmed_exclusion','lower_budget','gift_card','session_restore','no_stock_no_calls'];
  if(!planFingerprint||report.planFingerprint!==planFingerprint||!codeFingerprint||report.codeFingerprint!==codeFingerprint||!Array.isArray(report.checks)||report.checks.length!==ids.length)return false;
  if(!ids.every(id=>report.checks.filter(c=>c?.id===id&&c.state==='passed').length===1))return false;
  const confirmed=report.checks.find(c=>c.id==='confirmed_searches');
  if(!Array.isArray(tasteIds)||!tasteIds.length||!Array.isArray(confirmed.tasteIds)||JSON.stringify([...confirmed.tasteIds].sort())!==JSON.stringify([...tasteIds].sort()))return false;
  const initial=report.checks.find(c=>c.id==='initial_decision');
  if(!Array.isArray(initial.workKeys)||!initial.workKeys.length)return false;
  return ['initial_decision','confirmed_exclusion','lower_budget'].every((id,i)=>{
    const check=report.checks.find(c=>c.id===id);
    const budgetMinor=i===2?1500:2500;
    const allowed=new Set(eligibleEditions({budgetMinor,unavailableWorkKey:'priory',excludedWorkKeys:i?[initial.workKeys[0]]:[]}).map(e=>e.workKey));
    return check.version===i+1&&check.budgetMinor===budgetMinor&&Array.isArray(check.hardConstraintViolations)&&check.hardConstraintViolations.length===0&&Array.isArray(check.workKeys)&&check.workKeys.length>=1&&check.workKeys.length<=3&&new Set(check.workKeys).size===check.workKeys.length&&check.workKeys.every(key=>allowed.has(key));
  });
}

// Independent gate: deterministic Qloo evidence never satisfies the two-provider gate.
export function qlooOnlyEvidenceMatches(report,{planFingerprint,codeFingerprint,tasteIds}) {
  if(!report||report.state!=='passed'||report.source!=='live_qloo_only_http'||report.mode!=='qloo_only'||report.agent!=='deterministic'||report.qlooOnlyEndToEndVerified!==true||report.liveEndToEndVerified!==false||report.liveQlooVerified!==true||report.model!==null||report.providerCallsReserved!==5||report.calls?.qloo!==5||report.calls?.openai!==0)return false;
  return journeyChecksMatch(report,{planFingerprint,codeFingerprint,tasteIds});
}
