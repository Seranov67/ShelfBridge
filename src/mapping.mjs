import {catalog,eligibleEditions,catalogVersion} from './catalog.mjs';
import {validateMapping} from './providers.mjs';

export function mappingCoverage(mapping) {
  const works=[...new Set(catalog.map(e=>e.workKey))];
  const eligible=eligibleEditions({budgetMinor:100000,excludedWorkKeys:[],unavailableWorkKey:null});
  let valid=true;try{validateMapping(mapping);}catch{valid=false;}
  const mapped=valid?works.filter(key=>Object.hasOwn(mapping,key)):[];
  return {catalogVersion,totalWorks:works.length,mappedWorks:mapped.length,valid,coverageTargetMet:valid&&mapped.length>=24,missingWorks:works.filter(key=>!mapped.includes(key)),missingEligibleWorks:eligible.filter(e=>!mapped.includes(e.workKey)).map(e=>e.workKey)};
}
