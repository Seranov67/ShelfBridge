import {readFileSync} from 'node:fs';

export function renderBenchmarkReview(packet,ratingsTemplate) {
  // Embed data safely in a script context; all displayed values use textContent.
  const data=JSON.stringify({packet,ratingsTemplate}).replace(/[<>&\u2028\u2029]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
  return readFileSync(new URL('../scripts/benchmark-review.html',import.meta.url),'utf8').replace('/*BENCHMARK_PAYLOAD*/',()=>data);
}
