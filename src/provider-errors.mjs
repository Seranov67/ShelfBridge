import {readProviderJson} from './http.mjs';
import {fail} from './policy.mjs';

// Record only documented categories. Never forward arbitrary provider prose or headers.
const billingCodes=new Set(['insufficient_quota','credit_balance_exhausted','project_spend_limit_exceeded','organization_spend_limit_exceeded','organization_usage_limit_exceeded','usage_limit_exceeded']);
const rateCodes=new Set(['rate_limit_exceeded','slow_down']);
const codes=new Set([...billingCodes,...rateCodes,'invalid_api_key','model_not_found','server_is_overloaded','invalid_request_error']);
const types=new Set(['insufficient_quota','rate_limit_error','invalid_request_error','authentication_error','server_error','service_unavailable_error']);
export async function plannerFailure(response,signal) {
  let data;
  try{data=await readProviderJson(response,{signal,label:'The planner',code:'planner_contract',maxBytes:16384});}catch{}
  const providerCode=codes.has(data?.error?.code)?data.error.code:null;
  const providerType=types.has(data?.error?.type)?data.error.type:null;
  const failureKind=billingCodes.has(providerCode)||providerType==='insufficient_quota'?'billing_or_quota':rateCodes.has(providerCode)||providerType==='rate_limit_error'?'rate_limit':response.status===401||response.status===403?'authentication_or_access':response.status===429?'unknown_429':'provider_error';
  const rawRetry=response.headers?.get('retry-after');const seconds=rawRetry?Number(rawRetry):NaN;
  const retryAfterSeconds=Number.isFinite(seconds)&&seconds>=0&&seconds<=86400?Math.ceil(seconds):null;
  const message=failureKind==='billing_or_quota'?'The planner’s API billing or usage limit has been reached. Contact the demo operator.':failureKind==='rate_limit'?'The planner is busy. Please try again later.':'The agent planner is unavailable. No successful agent run is claimed.';
  return Object.assign(fail(message,503,'planner_unavailable'),{providerStatus:response.status,providerCode,providerType,failureKind,retryAfterSeconds});
}
