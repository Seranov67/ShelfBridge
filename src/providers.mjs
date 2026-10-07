import {fixtureTastes,catalog} from './catalog.mjs';
import {fail} from './policy.mjs';
import {readProviderJson,withSignal} from './http.mjs';
import {isQlooId,parseQlooSearch,parseQlooRanking} from './qloo-contract.mjs';
export {isQlooId} from './qloo-contract.mjs';

export class FixtureProvider {
  source='fixture';
  async search(query,type) {const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return fixtureTastes.filter(t=>t.type===type&&normalize(t.name).includes(normalize(query))).slice(0,5);}
  async rank(candidates,tastes,primaryTasteId,signal) {
    if(signal?.aborted)throw fail('Request cancelled.',499,'cancelled');
    const signals=primaryTasteId?tastes.filter(t=>t.id===primaryTasteId):tastes;
    const rows=candidates.map(e=>({workKey:e.workKey,weight:signals.reduce((sum,t)=>sum+(t.theme===e.theme?10:0),0)})).sort((a,b)=>b.weight-a.weight||a.workKey.localeCompare(b.workKey));
    return {rows:rows.map(({workKey})=>({workKey})),queriedAt:new Date().toISOString(),warning:'Teaching fixture: hand-authored theme sorting, not Qloo recommendations.',omitted:[]};
  }
}

export class QlooProvider {
  source='qloo';
  constructor({key,mapping={},budget,fetchImpl=fetch,approved=false}) {this.key=key;this.mapping=mapping;this.budget=budget;this.fetchImpl=fetchImpl;this.approved=approved;}
  async get(path,params,signal) {
    if(!this.key||this.key.startsWith('<'))throw fail('Qloo is not configured on this server.',503,'source_unavailable');
    const url=new URL(path,'https://hackathon.api.qloo.com');
    for(const [k,v]of Object.entries(params))if(v!==''&&v!=null)url.searchParams.set(k,String(v));
    const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000);
    deadline.throwIfAborted();this.budget.reserve('qloo');
    try {
      const response=await withSignal(this.fetchImpl(url,{headers:{'X-Api-Key':this.key},signal:deadline,redirect:'error'}),deadline);
      if(!response.ok) {
        void response.body?.cancel().catch(()=>{});
        if(response.status===404&&path==='/search')return {results:[]};
        throw fail(response.status===401?'Qloo authentication failed. Contact the demo operator.':response.status===429?'Qloo is busy. Please retry shortly.':'Qloo is unavailable. Please retry.',503,'source_unavailable');
      }
      return await readProviderJson(response,{signal:deadline,label:'Qloo',code:'source_contract'});
    }catch(error){if(error.status)throw error;throw fail('Qloo did not respond in time. No simulated results were substituted.',503,'source_unavailable');}
  }
  async search(query,type,signal) {
    const data=await this.get('/search',{query,types:`urn:entity:${type}`,take:5},signal);
    return parseQlooSearch(data,type);
  }
  async rank(candidates,tastes,primaryTasteId,signal) {
    this.checkReady(candidates,tastes);
    const ids=candidates.map(e=>this.mapping[e.workKey]);
    const selected=primaryTasteId?tastes.filter(t=>t.id===primaryTasteId):tastes;
    const data=await this.get('/v2/insights',{'filter.type':'urn:entity:book','signal.interests.entities':selected.map(t=>t.id).join(','),'filter.results.entities':ids.join(','),take:Math.min(50,ids.length)},signal);
    const rows=parseQlooRanking(data,candidates,this.mapping);
    return {rows,queriedAt:new Date().toISOString(),warning:'Rank evidence only. No causal graph explanation or likelihood of liking is claimed.',omitted:candidates.filter(e=>!rows.some(r=>r.workKey===e.workKey)).map(e=>e.workKey)};
  }
  checkReady(candidates,tastes) {
    if(!this.approved)throw fail('Live shelf mapping and Qloo response contract still require P00 verification.',503,'source_unavailable');
    if(!this.key||this.key.startsWith('<'))throw fail('Qloo is not configured on this server.',503,'source_unavailable');
    const ids=candidates.map(e=>this.mapping[e.workKey]);
    if(ids.some(id=>!isQlooId(id))||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length)throw fail('This shelf has an incomplete or duplicate Qloo mapping.',503,'source_contract');
    if(tastes.some(t=>!isQlooId(t.id)))throw fail('A confirmed taste is not a Qloo entity.',400);
  }
}
export function validateMapping(mapping) {
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw Error('Invalid mapping');
  const keys=new Set(catalog.map(e=>e.workKey));
  for(const[k,id]of Object.entries(mapping))if(!keys.has(k)||!isQlooId(id))throw Error('Invalid mapping entry');
  if(new Set(Object.values(mapping).map(id=>id.toLowerCase())).size!==Object.keys(mapping).length)throw Error('Duplicate Qloo mapping');
  return mapping;
}
