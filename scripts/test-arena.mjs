import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import worker from '../relay/arena-worker.js';

execFileSync('./node_modules/.bin/esbuild', ['src/engine/arena.ts', '--bundle', '--platform=node', '--format=cjs', '--outfile=/tmp/openphase-arena-test.cjs'], {stdio:'ignore'});
const {analyzeWithArena} = createRequire(import.meta.url)('/tmp/openphase-arena-test.cjs');
const origin='https://user.github.io', relay='https://openphase.test.workers.dev/';
const env={ALLOWED_ORIGIN:origin};
let calls=0, last;
const upstream = async (url, opts) => {
  calls++; last={url, opts, body: JSON.parse(opts.body)};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'Estimated from description',estimatedItems:[{name:'Egg',grams:50,calories:70,protein:6,carbs:1,fat:5,fiber:0}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
};
let response=await worker.fetch(new Request(relay,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}),env);
assert.equal(response.status,204); assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
response=await worker.fetch(new Request(relay,{method:'OPTIONS',headers:{Origin:'https://evil.example'}}),env); assert.equal(response.status,403);
response=await worker.fetch(new Request(relay,{method:'POST',headers:{Origin:origin},body:'{}'}),env); assert.equal(response.status,401);
response=await worker.fetch(new Request(relay,{method:'POST',headers:{Origin:origin,Authorization:'Bearer test'},body:'{}'}),env); assert.equal(response.status,400);
globalThis.fetch=async (url, opts) => {
  if(String(url).startsWith(relay)) {
    const req=new Request(url,{...opts,headers:{...opts.headers,Origin:origin}});
    globalThis.fetch=upstream;
    try { return await worker.fetch(req,env); } finally { globalThis.fetch=outer; }
  }
  return upstream(url,opts);
};
const outer=globalThis.fetch;
for (const photo of [false,true]) {
 const result=await analyzeWithArena({relayUrl:relay,apiKey:'fake-test-key',model:'coding-router-preview',prompt:'one egg',...(photo?{imageBase64:'AQID',imageMimeType:'image/jpeg'}:{})});
 assert.equal(result.estimatedItems[0].calories,70); assert.equal(last.url,'https://api.arena.ai/v1/chat/completions');
 assert.equal(last.opts.headers.Authorization,'Bearer fake-test-key'); assert.equal(last.body.messages[0].content.length,photo?2:1);
 assert.ok(!JSON.stringify(last.body).includes('contextSummary'));
}
assert.equal(calls,2);
await assert.rejects(()=>analyzeWithArena({relayUrl:'https://bad.example',apiKey:'x',model:'x',prompt:'egg'}), /workers.dev/);
console.log('Arena relay CORS, errors, text and photo round-trip tests passed (mock upstream; no real API key).');
