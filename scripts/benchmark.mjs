import {readFileSync,writeFileSync,mkdirSync,statSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareBenchmark,baselineCaptures,benchmarkUnits,checkBenchmarkCaptures,blindBenchmark,summarizeBenchmark} from '../src/benchmark.mjs';
import {renderBenchmarkReview} from '../src/benchmark-review.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))),out=join(root,'test-results','benchmark');
function read(path){if(!path||statSync(path).size>2_000_000)throw Error('Provide a local JSON file below 2 MB.');return JSON.parse(readFileSync(path,'utf8'));}
function save(name,value){mkdirSync(out,{recursive:true});writeFileSync(join(out,name),JSON.stringify(value,null,2));}
const [mode='prepare',input,extra]=process.argv.slice(2);
try {
  if(mode==='prepare') {
    if(existsSync(join(out,'collection.json')))throw Error('Archive the collection journal before preparing a new experiment.');
    if(existsSync(join(out,'captures.json'))){const existing=read(join(out,'captures.json'));if(!Array.isArray(existing)||existing.length)throw Error('Archive existing outcomes before preparing a new experiment.');}
    const review=input||join(root,'data',existsSync(join(root,'data','qloo-review.json'))?'qloo-review.json':'qloo-review.example.json');
    const plan=prepareBenchmark(read(review),{model:process.env.OPENAI_MODEL||'gpt-4.1-mini'});
    save('plan.json',plan);save('baseline.json',baselineCaptures(plan));
    save('capture-template.json',benchmarkUnits(plan).filter(u=>u.method!=='B0').map(u=>({id:u.id,state:null,workKeys:[],durationMs:null,calls:{qloo:null,openai:null},source:{B1:'openai',B2:'qloo',Full:'openai_qloo'}[u.method],model:['B1','Full'].includes(u.method)?plan.model:null,recordedAt:null})));
    console.log(JSON.stringify({state:plan.state,units:benchmarkUnits(plan).length,baselineOutcomes:baselineCaptures(plan).length,blockers:plan.blockers,providerCalls:0,qualityBenchmark:false,outputDirectory:out}));
    if(plan.state==='blocked')process.exitCode=1;
  } else {
    const plan=read(join(out,'plan.json')),captures=[...baselineCaptures(plan),...read(input)];
    if(mode==='check') {
      const report=checkBenchmarkCaptures(plan,captures);save('capture-check.json',report);
      console.log(JSON.stringify({expected:report.expected,received:report.received,missing:report.missing,invalid:report.invalid,failures:report.failures,liveQlooVerified:false}));
      if(plan.state!=='prepared'||report.missing||report.invalid)process.exitCode=1;
    } else if(mode==='blind') {
      const {packet,key,ratingsTemplate}=blindBenchmark(plan,captures,{participantId:extra});
      save(`${extra}-packet.json`,packet);save(`${extra}-PRIVATE-key.json`,key);save(`${extra}-ratings.json`,ratingsTemplate);
      writeFileSync(join(out,`${extra}-review.html`),renderBenchmarkReview(packet,ratingsTemplate));
      console.log(JSON.stringify({participantId:extra,items:packet.items.length,providerCalls:0,instructions:'Share only the packet and empty ratings template; keep the PRIVATE key local.'}));
    } else if(mode==='summarize') {
      const report=summarizeBenchmark(plan,captures,read(extra));save('summary.json',report);
      console.log(JSON.stringify({participants:report.participants,missingReadyRatings:report.missingReadyRatings,comparisons:report.comparisons,liveQlooVerified:false}));
    } else throw Error('Choose prepare, check, blind or summarize.');
  }
}catch{console.error('Benchmark command failed. Check mode, bounded JSON inputs, reviewed identities, frozen manifest, captures and anonymous ratings. Archive existing outcomes before preparing a new experiment. No provider calls were made.');process.exitCode=1;}
