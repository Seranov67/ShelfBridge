import {catalog,fixtureTastes} from './catalog.mjs';
import {evaluationTasks} from './evaluation.mjs';
import {isQlooId,validateMapping} from './providers.mjs';
import {mappingCoverage} from './mapping.mjs';
import {fail} from './policy.mjs';

// Compilation is an explicit operator action. Search candidates never confirm themselves.
export function compileReview(review) {
  if(!review||!Array.isArray(review.works)||!Array.isArray(review.profiles))throw fail('Expected works and profiles arrays.');
  const works=new Map(catalog.map(e=>[e.workKey,e]));const seen=new Set();const mapping={};
  for(const entry of review.works) {
    const work=works.get(entry?.workKey);
    if(!work||seen.has(entry.workKey)||entry.title!==work.title||entry.author!==work.author)throw fail('Book review identity does not match the local catalog.');
    seen.add(entry.workKey);
    if(entry.identityReviewed===true){if(!isQlooId(entry.qlooEntityId))throw fail('A reviewed book needs a real Qloo UUID.');mapping[entry.workKey]=entry.qlooEntityId.toLowerCase();}
  }
  validateMapping(mapping);const profileIds=new Set();const profiles=[];const confirmedIdentities=new Map();
  for(const profile of review.profiles) {
    const task=evaluationTasks.slice(0,10).find(t=>t.id===profile?.task);
    if(!task||profileIds.has(profile.task)||!Array.isArray(profile.tastes)||profile.tastes.length!==task.tastes.length)throw fail('Invalid or duplicate taste profile.');
    profileIds.add(profile.task);
    const queries=new Set();const ids=[];
    for(const taste of profile.tastes) {
      if(!task.tastes.includes(taste?.query)||queries.has(taste.query)||taste.type!==fixtureTastes.find(t=>t.name===taste.query)?.type)throw fail('Taste review does not match the predeclared profile.');
      queries.add(taste.query);
      if(taste.identityReviewed===true){
        if(!isQlooId(taste.qlooEntityId))throw fail('A reviewed taste needs a real Qloo UUID.');
        const id=taste.qlooEntityId.toLowerCase();const identity=`${taste.type}:${taste.query}`;
        if(confirmedIdentities.has(identity)&&confirmedIdentities.get(identity)!==id)throw fail('Repeated taste queries need the same confirmed identity.');
        const book=taste.type==='book'?[...works.values()].find(e=>e.title===taste.query):null;
        if(book&&mapping[book.workKey]&&mapping[book.workKey]!==id)throw fail('A book taste must match its reviewed catalog identity.');
        confirmedIdentities.set(identity,id);ids.push(id);
      }
    }
    if(new Set(ids).size!==ids.length)throw fail('Confirmed taste identities must be distinct within a profile.');
    if(ids.length===task.tastes.length)profiles.push({task:task.id,tasteIds:ids,budgetMinor:task.budgetMinor,unavailableWorkKey:task.unavailableWorkKey});
  }
  const coverage=mappingCoverage(mapping);
  return {ready:coverage.coverageTargetMet&&coverage.missingEligibleWorks.length===0&&profiles.length===10,mapping,profiles,coverage,reviewedProfiles:profiles.length};
}
