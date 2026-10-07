import {mappingCoverage} from './mapping.mjs';
import {p00EvidenceMatches} from './p00.mjs';
import {liveEvidenceMatches,qlooOnlyEvidenceMatches} from './live-evidence.mjs';
export {mappingCoverage} from './mapping.mjs';

export const hasKey=value=>typeof value==='string'&&Boolean(value.trim())&&!value.trim().startsWith('<');
export function readinessReport({env=process.env,mapping=null,plannerSmoke=null,p00=null,p00Plan=null,transportCheck=null,liveSmoke=null,liveCodeFingerprint=null}={}) {
  const coverage=mappingCoverage(mapping);
  const limit=Number(env.DAILY_PROVIDER_CALL_LIMIT||60);
  const transport=env.QLOO_TRANSPORT||'cli';
  const checks={qlooKeyConfigured:hasKey(env.QLOO_API_KEY),openAIKeyConfigured:hasKey(env.OPENAI_API_KEY),mappingValid:coverage.valid,mappingCoverageTargetMet:coverage.coverageTargetMet,allEligibleWorksMapped:coverage.valid&&coverage.missingEligibleWorks.length===0,qlooContractApproved:env.QLOO_CONTRACT_APPROVED==='true',dailyLimitValid:Number.isInteger(limit)&&limit>=1&&limit<=1000,qlooTransportReady:transport==='cli'&&transportCheck?.kind==='cli'&&transportCheck.ready===true};
  const model=env.OPENAI_MODEL||'gpt-4.1-mini';
  const mappingMatchesPlan=coverage.valid&&p00Plan?.mapping&&JSON.stringify(Object.entries(mapping).map(([key,id])=>[key,id.toLowerCase()]).sort())===JSON.stringify(Object.entries(p00Plan.mapping).sort());
  const evidence={plannerSmokePassed:plannerSmoke?.state==='passed'&&plannerSmoke.model===model&&plannerSmoke.agent==='llm_tool_loop',p00Passed:Boolean(transport==='cli'&&mappingMatchesPlan&&p00EvidenceMatches(p00,p00Plan))};
  evidence.realEndToEndPassed=liveEvidenceMatches(liveSmoke,{model,planFingerprint:p00Plan?.fingerprint,codeFingerprint:liveCodeFingerprint,tasteIds:p00Plan?.requests?.find(r=>r.id==='T01')?.tasteIds});
  const kinds=['billing_or_quota','rate_limit','authentication_or_access','unknown_429','provider_error'];
  const plannerDiagnostic=plannerSmoke?{passed:plannerSmoke.state==='passed',providerStatus:Number.isInteger(plannerSmoke.providerStatus)&&plannerSmoke.providerStatus>=100&&plannerSmoke.providerStatus<=599?plannerSmoke.providerStatus:null,failureKind:kinds.includes(plannerSmoke.failureKind)?plannerSmoke.failureKind:null}:null;
  const remainingReleaseGates=[...(!evidence.p00Passed?['current_event_transport']:[]),...(!evidence.realEndToEndPassed?['real_end_to_end']:[]),'human_outcomes','public_repository','external_https_hosting','provider_spend_limits'];
  return {checkedAt:new Date().toISOString(),model,transport,transportCheck,checks,coverage,evidence,plannerDiagnostic,runtimeConfigurationReady:Object.values(checks).every(Boolean),liveIntegrationEvidenceReady:Object.values(evidence).every(Boolean),releaseReady:false,remainingReleaseGates};
}

export function qlooOnlyReadiness({qlooOnlySmoke=null,...options}={}) {
  const base=readinessReport(options);
  const {openAIKeyConfigured,...checks}=base.checks;
  const evidence={p00Passed:base.evidence.p00Passed,qlooOnlyJourneyPassed:qlooOnlyEvidenceMatches(qlooOnlySmoke,{planFingerprint:options.p00Plan?.fingerprint,codeFingerprint:options.liveCodeFingerprint,tasteIds:options.p00Plan?.requests?.find(r=>r.id==='T01')?.tasteIds})};
  return {checkedAt:base.checkedAt,mode:'qloo_only',agent:'deterministic',model:null,checks,coverage:base.coverage,transport:base.transport,transportCheck:base.transportCheck,evidence,runtimeConfigurationReady:Object.values(checks).every(Boolean),liveIntegrationEvidenceReady:Object.values(evidence).every(Boolean),liveEndToEndVerified:false,releaseReady:false,remainingReleaseGates:[...(!evidence.p00Passed?['current_event_transport']:[]),...(!evidence.qlooOnlyJourneyPassed?['qloo_only_journey']:[]),'agent_integration','human_outcomes','public_repository','external_https_hosting','provider_spend_limits']};
}
