export function fail(message, status=400, code='invalid_request') { return Object.assign(new Error(message),{status,code}); }
export function validateRequest(body, knownTastes, knownWorks) {
  if (!Number.isInteger(body.budgetMinor) || body.budgetMinor < 100 || body.budgetMinor > 100000) throw fail('Choose a budget between $1 and $1,000.');
  if (!Array.isArray(body.tasteIds) || body.tasteIds.length < 1 || body.tasteIds.length > 3 || new Set(body.tasteIds).size !== body.tasteIds.length || body.tasteIds.some(id=>!knownTastes.has(id))) throw fail('Confirm one to three search results first.',400,'taste_confirmation_required');
  if (body.unavailableWorkKey && !knownWorks.has(body.unavailableWorkKey)) throw fail('Unknown unavailable book.');
  if (body.primaryTasteId && !body.tasteIds.includes(body.primaryTasteId)) throw fail('The primary taste must be one of your confirmed tastes.');
  return {budgetMinor:body.budgetMinor,tasteIds:[...body.tasteIds],unavailableWorkKey:body.unavailableWorkKey||null,primaryTasteId:body.primaryTasteId||null,excludedWorkKeys:[],version:1};
}
export function refine(request, body, lastCards, refinementCount) {
  if (body.version !== request.version) throw fail('This selection changed. Reload the latest result.',409,'version_conflict');
  if (refinementCount >= 2) throw fail('Two refinements used. Start a new gift brief.',429,'refinement_limit');
  const next = structuredClone(request);
  if (body.kind === 'exclude') {
    if (!lastCards.some(c=>c.workKey===body.workKey)) throw fail('Only a current recommendation can be rejected.');
    next.excludedWorkKeys = [...new Set([...next.excludedWorkKeys,body.workKey])];
  } else if (body.kind === 'budget') {
    if (!Number.isInteger(body.budgetMinor) || body.budgetMinor < 100 || body.budgetMinor >= request.budgetMinor) throw fail('Enter a lower budget of at least $1.');
    next.budgetMinor = body.budgetMinor;
  } else if (body.kind === 'remove_taste') {
    if (!next.tasteIds.includes(body.tasteId) || next.tasteIds.length <= 1) throw fail('Keep at least one confirmed taste.');
    next.tasteIds = next.tasteIds.filter(id=>id!==body.tasteId);
    if (next.primaryTasteId===body.tasteId) next.primaryTasteId=null;
  } else throw fail('Unsupported refinement.');
  next.version++;
  return next;
}
export function assertRanking(rows, candidates) {
  const allowed = new Set(candidates.map(e=>e.workKey));
  if (!Array.isArray(rows) || rows.length > 50 || rows.some(r=>!r || !allowed.has(r.workKey)) || new Set(rows.map(r=>r.workKey)).size !== rows.length) throw fail('The source returned an invalid shelf ranking.',502,'source_contract');
}
