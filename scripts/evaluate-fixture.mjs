import {evaluateFixtures} from '../src/evaluation.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const report=await evaluateFixtures();mkdirSync(join(root,'test-results'),{recursive:true});writeFileSync(join(root,'test-results','fixture-evaluation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({state:report.state,source:report.source,tasks:report.tasks,repairs:report.repairs,noStockTasks:report.noStockTasks,hardConstraintViolations:report.hardConstraintViolations,liveQlooVerified:false,qualityBenchmark:false}));
if(report.state!=='passed')process.exitCode=1;
