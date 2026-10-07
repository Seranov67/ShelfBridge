// Original demo merchandising data. Prices, formats and quantities are simulated.
// workKey is local; it is NOT a Qloo ID or a bibliographic edition identifier.
const works = [
  ['piranesi','Piranesi','Susanna Clarke','A strange house. A quietly unfolding mystery.','mystery',1800,4,'sage'],
  ['ocean','The Ocean at the End of the Lane','Neil Gaiman','Memory and wonder in a short, imaginative novel.','wonder',1600,3,'navy'],
  ['night-circus','The Night Circus','Erin Morgenstern','Two magicians and an extraordinary circus.','wonder',2200,2,'wine'],
  ['station-eleven','Station Eleven','Emily St. John Mandel','Art and human connection after a pandemic.','connection',1700,5,'ochre'],
  ['left-hand','The Left Hand of Darkness','Ursula K. Le Guin','An envoy encounters a radically different world.','speculative',1900,3,'navy'],
  ['earthsea','A Wizard of Earthsea','Ursula K. Le Guin','A young wizard learns the cost of power.','wonder',1400,6,'sage'],
  ['long-way','The Long Way to a Small, Angry Planet','Becky Chambers','A spacefaring crew builds a shared home.','connection',1850,4,'ochre'],
  ['monk-robot','A Psalm for the Wild-Built','Becky Chambers','A tea monk and a robot consider what people need.','connection',1500,3,'sage'],
  ['never-let-go','Never Let Me Go','Kazuo Ishiguro','A novel of memory, friendship and a hidden future.','speculative',1800,4,'wine'],
  ['klara','Klara and the Sun','Kazuo Ishiguro','An artificial friend observes the human world.','speculative',2000,2,'ochre'],
  ['sea-tranquility','Sea of Tranquility','Emily St. John Mandel','Lives connect across centuries and space.','speculative',1750,4,'navy'],
  ['cloud-atlas','Cloud Atlas','David Mitchell','Six interwoven stories cross eras and genres.','speculative',2100,3,'wine'],
  ['secret-history','The Secret History','Donna Tartt','A close group of students and a consequential secret.','mystery',1900,5,'wine'],
  ['thursday','The Thursday Murder Club','Richard Osman','Four retirees investigate an unsolved crime.','mystery',1600,6,'ochre'],
  ['orient','Murder on the Orient Express','Agatha Christie','A detective investigates a murder on a train.','mystery',1200,4,'navy'],
  ['rebecca','Rebecca','Daphne du Maurier','A new marriage shadowed by an earlier life.','mystery',1450,3,'sage'],
  ['evelyn','The Seven Husbands of Evelyn Hugo','Taylor Jenkins Reid','A screen legend tells the story of her life.','connection',1700,5,'wine'],
  ['tomorrow','Tomorrow, and Tomorrow, and Tomorrow','Gabrielle Zevin','A friendship grows through the making of games.','connection',2000,3,'sage'],
  ['small-things','Small Things Like These','Claire Keegan','A coal merchant faces a difficult moral choice.','connection',1300,4,'ochre'],
  ['bookshop','The Bookshop','Penelope Fitzgerald','A woman opens a bookshop in a coastal town.','connection',1250,2,'navy'],
  ['dune','Dune','Frank Herbert','Politics and power on a desert planet.','speculative',2300,3,'ochre'],
  ['hitchhiker',"The Hitchhiker’s Guide to the Galaxy",'Douglas Adams','An absurd journey through space.','wonder',1500,5,'navy'],
  ['hobbit','The Hobbit','J. R. R. Tolkien','An unexpected journey with a reluctant adventurer.','wonder',1650,4,'sage'],
  ['invisible-cities','Invisible Cities','Italo Calvino','Imagined cities in a conversation with an emperor.','wonder',1550,3,'wine'],
  ['priory','The Priory of the Orange Tree','Samantha Shannon','A large fantasy novel of kingdoms and dragons.','wonder',2600,0,'wine'],
  ['memory-empire','A Memory Called Empire','Arkady Martine','An ambassador navigates an imperial capital.','speculative',2200,0,'navy'],
  ['gone-girl','Gone Girl','Gillian Flynn','A missing woman and conflicting accounts.','mystery',1700,0,'wine'],
  ['normal-people','Normal People','Sally Rooney','An evolving relationship between two young people.','connection',1550,0,'sage'],
  ['little-prince','The Little Prince','Antoine de Saint-Exupéry','A traveller encounters a small prince.','wonder',1100,4,'ochre'],
  ['martian','The Martian','Andy Weir','An astronaut works to survive alone on Mars.','speculative',1800,4,'navy']
];
export const catalogVersion = 'demo-2026-10-04-v1';
export const stockAsOf = '2026-10-04T09:00:00.000Z';
export const catalog = works.map(([workKey,title,author,note,theme,priceMinor,stockCount,color]) => ({workKey,title,author,note,theme,priceMinor,stockCount,color,sku:`SB-${workKey}-P`,format:'Demo paperback',language:'English',currency:'USD',stockAsOf,catalogVersion}));
catalog.push({...catalog[0],sku:'SB-piranesi-H',format:'Demo hardcover',priceMinor:2800,stockCount:2});
export const fixtureTastes = [
  {id:'fixture:movie:amelie',name:'Amélie',type:'movie',detail:'2001 · film',theme:'wonder'},
  {id:'fixture:artist:aurora',name:'AURORA',type:'artist',detail:'Norwegian artist',theme:'wonder'},
  {id:'fixture:movie:arrival',name:'Arrival',type:'movie',detail:'2016 · film',theme:'speculative'},
  {id:'fixture:movie:interstellar',name:'Interstellar',type:'movie',detail:'2014 · film',theme:'speculative'},
  {id:'fixture:artist:radiohead',name:'Radiohead',type:'artist',detail:'British band',theme:'speculative'},
  {id:'fixture:movie:knives-out',name:'Knives Out',type:'movie',detail:'2019 · film',theme:'mystery'},
  {id:'fixture:movie:grand-budapest',name:'The Grand Budapest Hotel',type:'movie',detail:'2014 · film',theme:'mystery'},
  {id:'fixture:movie:before-sunrise',name:'Before Sunrise',type:'movie',detail:'1995 · film',theme:'connection'},
  {id:'fixture:artist:hozier',name:'Hozier',type:'artist',detail:'Irish artist',theme:'connection'},
  {id:'fixture:movie:her',name:'Her',type:'movie',detail:'2013 · film',theme:'connection'}
];
fixtureTastes.push(...[...new Map(catalog.map(e=>[e.workKey,e])).values()].map(e=>({id:`fixture:book:${e.workKey}`,name:e.title,type:'book',detail:e.author,theme:e.theme})));
export function eligibleEditions(request, editions = catalog) {
  const excluded = new Set([...request.excludedWorkKeys,request.unavailableWorkKey].filter(Boolean));
  const cheapest = new Map();
  for (const e of editions) {
    if (excluded.has(e.workKey) || e.currency !== 'USD' || !Number.isSafeInteger(e.priceMinor) || e.priceMinor < 0 || !Number.isInteger(e.stockCount) || e.stockCount <= 0 || !e.stockAsOf || !Number.isFinite(Date.parse(e.stockAsOf)) || e.priceMinor > request.budgetMinor) continue;
    const old = cheapest.get(e.workKey);
    if (!old || e.priceMinor < old.priceMinor || (e.priceMinor === old.priceMinor && e.sku < old.sku)) cheapest.set(e.workKey,e);
  }
  return [...cheapest.values()].sort((a,b)=>a.workKey.localeCompare(b.workKey));
}
