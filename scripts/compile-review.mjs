import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileReview} from '../src/review.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
try {
  const args=process.argv.slice(2);if(args.length!==1)throw Error('Pass one local reviewed JSON file, e.g. data/qloo-review.json.');
  const input=JSON.parse(readFileSync(resolve(args[0]),'utf8'));const result=compileReview(input);
  const report={checkedAt:new Date().toISOString(),state:result.ready?'ready_for_p00':'blocked',coverage:result.coverage,reviewedProfiles:result.reviewedProfiles,liveQlooVerified:false};
  mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results','mapping-review.json'),JSON.stringify(report,null,2));
  if(result.ready) {
    const save=(name,data)=>{const path=join(root,'data',name);writeFileSync(path+'.tmp',JSON.stringify(data,null,2)+'\n');renameSync(path+'.tmp',path);};
    save('qloo-mapping.json',result.mapping);save('qloo-profiles.json',result.profiles);
  }else process.exitCode=1;
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.code==='invalid_request'?error.message:'Could not compile the review. Check the file, identities and uniqueness.');process.exitCode=1;}
