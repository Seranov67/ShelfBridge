import {fail} from './policy.mjs';

export const isQlooId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

// Use the same strict boundary for production and local contract replay.
export function parseQlooSearch(data,type) {
  if(!['movie','artist','book'].includes(type)||data?.success===false||!Array.isArray(data?.results))throw fail('Search response contract is not verified.',502,'source_contract');
  const seen=new Set();
  return data.results.map(e=>{
    if(!isQlooId(e?.entity_id)||typeof e.name!=='string'||!e.name.trim()||!Array.isArray(e.types)||!e.types.includes(`urn:entity:${type}`))throw fail('Search returned an invalid entity.',502,'source_contract');
    const id=e.entity_id.toLowerCase();if(seen.has(id))throw fail('Search returned duplicate identities.',502,'source_contract');seen.add(id);
    const disambiguation=typeof e.disambiguation==='string'?e.disambiguation.trim():'';
    const year=e.properties?.release_year??e.properties?.publication_year;
    const detail=disambiguation||((typeof year==='number')?String(year):'Qloo search result · verify identity');
    return {id,name:e.name.slice(0,160),type,detail:detail.slice(0,240)};
  }).slice(0,5);
}

export function parseQlooRanking(data,candidates,mapping) {
  if(data?.success===false||!Array.isArray(data?.results?.entities)||data.results.entities.length>50)throw fail('Insights response contract is not verified.',502,'source_contract');
  const byId=new Map(candidates.map(e=>[mapping[e.workKey]?.toLowerCase(),e.workKey]));const seen=new Set();
  return data.results.entities.map(e=>{
    if(!isQlooId(e?.entity_id)||!byId.has(e.entity_id.toLowerCase()))throw fail('Qloo returned an entity outside the approved shelf.',502,'source_contract');
    const id=e.entity_id.toLowerCase();if(seen.has(id))throw fail('Qloo returned duplicate shelf identities.',502,'source_contract');seen.add(id);
    return {workKey:byId.get(id),entityId:id};
  });
}
