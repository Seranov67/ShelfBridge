const $=id=>document.getElementById(id);
let bootstrap,selected=[],decision=null,busy=false,gift=null,refinementsLeft=2,dirty=false,ready=false,stale=false;
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
async function api(path,body){
  let res;try{res=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});}catch{throw new Error('Cannot reach the server. Check your connection, then refresh the saved selection.');}
  let data;try{data=await res.json();}catch{throw new Error('The server returned an unreadable response. Refresh the saved selection to reconnect.');}
  if(!res.ok)throw Object.assign(new Error(data.error||'Please try again.'),{code:data.code,status:res.status});return data;
}
function status(message,loading=false){$('status').replaceChildren();if(message)$('status').append(el('div',message,`status-message${loading?' loading':''}`));}
function showError(error){
  if(['version_conflict','taste_confirmation_required'].includes(error.code))stale=true;
  status(error.message);const box=$('status').firstElementChild;box.replaceChildren(el('p',error.message));
  box.append(el('p','Refresh loads the saved selection and replaces the taste edits on this page.','hint'));
  const refresh=el('button',ready?'Refresh saved selection':'Reconnect','secondary');refresh.type='button';refresh.addEventListener('click',refreshSelection);box.append(refresh);setBusy(busy);
}
function setBusy(value){
  busy=value;const locked=value||!ready;
  $('brief-form').setAttribute('aria-busy',String(value));
  for(const control of $('brief-form').querySelectorAll('input,select,button'))control.disabled=locked;
  $('sample').disabled=locked;
  for(const id of ['lower-budget','new-budget'])$(id).disabled=locked||dirty||stale||refinementsLeft===0;
  for(const b of document.querySelectorAll('#cards button, #evidence-content button'))b.disabled=locked||dirty||stale||(b.dataset.refinement==='true'&&refinementsLeft===0);
  for(const b of document.querySelectorAll('#status button'))b.disabled=value;
}
function markDirty(){if(!decision)return;const wasDirty=dirty;dirty=Math.round(Number($('budget').value)*100)!==decision.budgetMinor||($('unavailable').value||null)!==decision.unavailableWorkKey||($('priority').value||null)!==decision.primaryTasteId||JSON.stringify(selected.map(t=>t.id).sort())!==JSON.stringify(decision.tastes.map(t=>t.id).sort());setBusy(busy);if(dirty)status('Brief changed. Find an alternative again to apply it; the previous selection is paused.');else if(wasDirty)status('Brief matches the current selection. Gift choices are available.');}
function tastes(){
  $('tastes').replaceChildren();const priority=$('priority').value;$('priority').replaceChildren(new Option('Keep all confirmed tastes together',''));
  for(const t of selected){const chip=el('span',undefined,'taste-chip');chip.append(el('span',`${t.name} · ${t.type}`));const remove=el('button','×');remove.type='button';remove.setAttribute('aria-label',`Remove ${t.name} from gift brief`);remove.addEventListener('click',()=>{selected=selected.filter(x=>x.id!==t.id);tastes();});chip.append(remove);$('tastes').append(chip);$('priority').append(new Option(t.name,t.id));}
  if(selected.some(t=>t.id===priority))$('priority').value=priority;
  markDirty();
}
function renderMatches(results){
  $('search-results').replaceChildren();
  for(const t of results){const b=el('button',undefined,'search-result');b.type='button';b.append(el('span',t.name),el('small',t.detail));b.addEventListener('click',()=>{if(busy||!ready)return;if(selected.length>=3&&!selected.some(x=>x.id===t.id)){status('Keep at most three tastes. Remove one to add another.');return;}if(!selected.some(x=>x.id===t.id))selected.push(t);tastes();$('search-results').replaceChildren();$('taste-query').value='';status('Match selected. Review the brief, then confirm by finding an alternative.');});$('search-results').append(b);}
}
async function search(){if(busy||!ready)return;const query=$('taste-query').value.trim();if(!query){status('Enter a film, artist or book to search.');return;}
  setBusy(true);status('Looking for the exact cultural match…',true);$('search-results').replaceChildren();
  try{const data=await api(`/api/search?query=${encodeURIComponent(query)}&type=${$('taste-type').value}`);renderMatches(data.results);status(data.results.length?'Select the exact match below.':'No match found. Try a different title or artist.');}catch(e){showError(e);}finally{setBusy(false);}}
$('search').addEventListener('click',search);$('taste-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
for(const id of ['budget','unavailable','priority'])$(id).addEventListener('input',markDirty);
$('shelf-toggle').addEventListener('click',()=>{$('shelf').classList.toggle('hidden');const hidden=$('shelf').classList.contains('hidden');$('shelf-toggle').textContent=hidden?'View the shelf ↗':'Hide the shelf';$('shelf-toggle').setAttribute('aria-expanded',String(!hidden));});
$('sample').addEventListener('click',async()=>{if(busy||!ready)return;setBusy(true);try{const a=await api('/api/search?query=Am%C3%A9lie&type=movie');
  if(bootstrap.mode==='fixture'){const b=await api('/api/search?query=AURORA&type=artist');selected=[a.results[0],b.results[0]].filter(Boolean);$('search-results').replaceChildren();}else{selected=[];$('taste-query').value='Amélie';renderMatches(a.results);status('Live identities need your confirmation. Select the recipient’s actual match.');}
  $('unavailable').value='priory';$('budget').value='25';tastes();$('brief-form').scrollIntoView({behavior:'smooth',block:'center'});if(bootstrap.mode==='fixture')status('Sample brief: Amélie + AURORA, with a $25 limit. Review and confirm the tastes below.');
}catch(e){showError(e);}finally{setBusy(false);}});
$('brief-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;if(!selected.length){status('Search and select at least one exact taste first.');$('taste-query').focus();return;}await run('/api/decide',{budgetMinor:Math.round(Number($('budget').value)*100),tasteIds:selected.map(t=>t.id),unavailableWorkKey:$('unavailable').value||null,primaryTasteId:$('priority').value||null});});
async function run(path,body){setBusy(true);status(bootstrap.mode==='qloo_only'?'Checking shelf boundaries and asking Qloo to rebuild the shortlist…':'Checking shelf boundaries, planning the query and rebuilding the shortlist…',true);
  try{const data=await api(path,body);decision=data.decision;refinementsLeft=data.refinementsLeft;stale=false;render();status(decision.state==='ready'?(decision.source==='fixture'?'Teaching demo · these choices use sample data, not live Qloo.':bootstrap.mode==='qloo_only'?'Live Qloo ranking · deterministic workflow; no LLM. Inventory is simulated.':'Live Qloo shelf ranking · inventory remains simulated.'):decision.message);$('results-title').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){showError(e);}finally{setBusy(false);}}
function confirmChange(text){$('confirm-text').textContent=text;const dialog=$('confirm-dialog');dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));}
async function change(body,text){if(busy||dirty||stale||!decision)return;if(refinementsLeft===0){status('Two refinements used. Edit the brief and start another selection.');return;}if(await confirmChange(text))await run('/api/refine',{...body,version:decision.version,decisionId:decision.id});}
$('lower-budget').addEventListener('click',()=>{if(!$('new-budget').reportValidity())return;change({kind:'budget',budgetMinor:Math.round(Number($('new-budget').value)*100)},`Use ${money(Math.round(Number($('new-budget').value)*100))} as the new maximum. Keep the confirmed tastes and exclusions; rerank only affordable stock.`);});
function render(){
  if(decision.source==='qloo'&&decision.evidence)$('mode').textContent=bootstrap.mode==='qloo_only'?'Live Qloo · no LLM · demo inventory':'Live Qloo · demo inventory';
  $('budget').value=(decision.budgetMinor/100).toFixed(2);selected=decision.tastes.map(t=>({...t}));tastes();$('priority').value=decision.primaryTasteId||'';$('unavailable').value=decision.unavailableWorkKey||'';
  const excluded=(decision.excludedWorkKeys||[]).map(key=>bootstrap.catalog.find(e=>e.workKey===key)?.title).filter(Boolean);$('exclusions').classList.toggle('hidden',!excluded.length);$('exclusions').textContent=`Excluded in this selection: ${excluded.join(', ')}. Starting a new brief clears these refusals.`;
  $('empty').classList.add('hidden');$('results-title').textContent=decision.state==='ready'?'Thoughtful alternatives, on the shelf.':'No forced match. Let’s adjust the brief.';$('result-count').textContent=`${decision.cards.length} available ${decision.cards.length===1?'choice':'choices'}`;$('cards').replaceChildren();
  for(const c of decision.cards){const card=el('article',undefined,'card');const coverArea=el('div',undefined,'cover-area');coverArea.setAttribute('aria-hidden','true');const cover=el('div',undefined,`book cover ${c.color}`);cover.append(el('span',c.author.toUpperCase()),el('strong',c.title),el('small','SHELFBRIDGE · DEMO'));coverArea.append(el('span',`CHOICE ${String(c.rank).padStart(2,'0')}`,'rank'),cover);const content=el('div',undefined,'card-content');content.append(el('h3',c.title),el('p',c.author,'author'));const facts=el('div',undefined,'book-facts');facts.append(el('strong',money(c.priceMinor)),el('span',`${c.stockCount} in demo stock`,'stock'));content.append(facts,el('p',c.note,'book-description'),el('p',`${c.format} · ${c.tradeoff}`,'tradeoff'));const actions=el('div',undefined,'card-actions');const choose=el('button','Choose this gift','primary');choose.addEventListener('click',()=>chooseGift(c));const reject=el('button','Already owned / exclude','text-button');reject.dataset.refinement='true';reject.addEventListener('click',()=>change({kind:'exclude',workKey:c.workKey},`Exclude “${c.title}” from this gift. All its editions will be removed. Rebuild with the same confirmed tastes and budget.`));actions.append(choose,reject);content.append(actions);card.append(coverArea,content);$('cards').append(card);}
  $('refine-bar').classList.toggle('hidden',!decision.cards.length);$('refinements-note').textContent=refinementsLeft?`${refinementsLeft} rebuilds left. Confirm a new limit to update the shortlist.`:'No rebuilds left. Edit the brief and find another selection.';$('new-budget').max=(decision.budgetMinor-1)/100;$('new-budget').value=Math.max(1,Math.min(18,(decision.budgetMinor-100)/100));
  $('diff').replaceChildren();$('diff').classList.toggle('hidden',!decision.diff);if(decision.diff){$('diff').append(el('strong',`Selection rebuilt · v${decision.diff.previousVersion} → v${decision.diff.newVersion}`));$('diff').append(el('p',`Removed: ${decision.diff.removed.join(', ')||'none of the top three'}.`),el('p',`Added: ${decision.diff.added.join(', ')||'the same eligible top choices remain'}. Budget: ${money(decision.budgetMinor)}.`));}
  evidence();markDirty();document.querySelectorAll('.workflow span').forEach((s,i)=>s.classList.toggle('active',i===1));
}
function evidence(){const box=$('evidence-content');box.replaceChildren();$('evidence').classList.toggle('hidden',!decision.evidence);if(!decision.evidence)return;
  const dl=el('dl');for(const[k,v]of Object.entries({'Source':decision.source==='qloo'?'Live Qloo Taste Graph':'Teaching fixture — no Qloo API call','Workflow':decision.agent==='llm_tool_loop'?'LLM tool loop':decision.source==='qloo'?'Deterministic workflow · no LLM':'Deterministic teaching workflow','Tastes used':decision.tastes.filter(t=>decision.evidence.signalIds.includes(t.id)).map(t=>t.name).join(' + '),'Query time':new Date(decision.evidence.queriedAt).toLocaleString('en-US'),'Shelf boundary':`${decision.evidence.candidateWorkKeys.length} eligible works · ${money(decision.budgetMinor)} maximum`,'Coverage':`${decision.evidence.returnedWorkKeys.length} returned, ${decision.evidence.omittedWorkKeys.length} omitted`,'Inventory snapshot':`${new Date(bootstrap.stockAsOf).toLocaleDateString('en-US')} · simulated`,'Evidence reference':decision.evidence.id}))dl.append(el('dt',k),el('dd',v));box.append(dl,el('p',decision.evidence.warning));const list=el('ol');for(const step of decision.trace)list.append(el('li',`${step.actor} → ${step.tool}${step.strategy?` (${step.strategy})`:''}${step.returnedCount!==undefined?` · ${step.returnedCount} returned`:''}`));box.append(list);
  if(decision.cards.length){const rankings=el('ul',undefined,'ranking-details');for(const c of decision.cards)rankings.append(el('li',`${c.title} — ${c.reason}`));box.append(el('p','Ranking details','evidence-heading'),rankings);}
  for(const t of decision.tastes){if(decision.tastes.length<2)break;const b=el('button',`Remove taste: ${t.name}`,'text-button');b.dataset.refinement='true';b.addEventListener('click',()=>change({kind:'remove_taste',tasteId:t.id},`Remove “${t.name}” from the confirmed taste signals and make a fresh ranking. Budget and exclusions stay in place.`));box.append(b);}
}
async function chooseGift(c){if(busy||dirty||stale||!ready)return;setBusy(true);try{gift=await api('/api/gift-card',{sku:c.sku,version:decision.version,decisionId:decision.id});$('gift-content').replaceChildren(el('h2',gift.title),el('p',`by ${gift.author}`,'author'),el('p',gift.giftNote,'gift-note'),el('p',gift.note,'gift-description'),el('p',`${gift.format} · ${money(gift.priceMinor)} · ${gift.sku}`,'gift-metadata'),el('p',`Demo inventory: price and stock are simulated. ${gift.source==='fixture'?'Sample recommendation; no live Qloo evidence.':'Based on a live Qloo ranking.'} No purchase or reservation has been made.`,'hint'));$('copy-status').textContent='';$('gift-dialog').showModal();document.querySelectorAll('.workflow span').forEach((s,i)=>s.classList.toggle('active',i===2));}catch(e){showError(e);}finally{setBusy(false);}}
$('close-gift').addEventListener('click',()=>$('gift-dialog').close());$('gift-dialog').addEventListener('close',()=>document.querySelectorAll('.workflow span').forEach((s,i)=>s.classList.toggle('active',i===1)));$('copy-gift').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(gift.text);$('copy-status').textContent='Gift note copied.';}catch{$('copy-status').textContent='Copy is unavailable in this browser. Use Print card instead.';}});$('print-gift').addEventListener('click',()=>window.print());
function restoreBootstrap(data){
  bootstrap=data;ready=true;stale=false;refinementsLeft=data.refinementsLeft;
  $('mode').textContent=data.mode==='fixture'?'Teaching demo · Qloo offline':data.mode==='qloo_only'?'Live Qloo · no LLM · demo inventory':'Qloo · awaiting live verification';$('mode').classList.toggle('fixture',data.mode==='fixture');
  const unavailable=$('unavailable').value;const works=new Map(data.catalog.map(e=>[e.workKey,e]));$('unavailable').replaceChildren(new Option('Start from their tastes instead',''));$('shelf-list').replaceChildren();$('search-results').replaceChildren();
  for(const e of works.values()){$('unavailable').append(new Option(`${e.title}${e.stockCount===0?' · unavailable':''}`,e.workKey));const item=el('div',undefined,'shelf-item');item.append(el('strong',e.title),el('small',`${e.author} · ${money(e.priceMinor)} · ${e.stockCount} simulated units`));$('shelf-list').append(item);}
  $('unavailable').value=unavailable;$('stock-date').textContent=`${works.size} book works · ${data.catalog.length} simulated SKUs · snapshot ${new Date(data.stockAsOf).toLocaleDateString('en-US')}`;
  decision=data.lastDecision;gift=null;
  if(decision){render();return;}
  selected=[];dirty=false;tastes();$('taste-query').value='';$('cards').replaceChildren();$('diff').replaceChildren();$('evidence-content').replaceChildren();
  for(const id of ['diff','refine-bar','evidence','exclusions'])$(id).classList.add('hidden');
  $('empty').classList.remove('hidden');$('results-title').textContent='Their next favourite could be here.';$('result-count').textContent='Ready for a new brief';document.querySelectorAll('.workflow span').forEach((s,i)=>s.classList.toggle('active',i===0));
}
async function refreshSelection(){
  if(busy)return;setBusy(true);status('Reconnecting and loading the saved selection…',true);
  try{restoreBootstrap(await api('/api/bootstrap'));status(decision?'Saved selection loaded. Review the current choices before choosing a gift.':'Connected. No saved selection remains; search and confirm the recipient’s tastes again.');}catch(e){ready=false;$('mode').textContent='Server unavailable';showError(e);}finally{setBusy(false);}
}
setBusy(true);
try{restoreBootstrap(await api('/api/bootstrap'));}catch(e){ready=false;$('mode').textContent='Server unavailable';showError(e);}finally{setBusy(false);}
