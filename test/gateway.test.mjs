import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, loadConfig, routeAllowed } from '../server.mjs';
import { fixtureApi,imageRef,picture } from './fixtures.mjs';

async function setup(t,env={}) {
  const fixture=fixtureApi();fixture.server.listen(0,'127.0.0.1');await once(fixture.server,'listening');
  const upstream=`http://127.0.0.1:${fixture.server.address().port}/root`;
  const app=createApp(loadConfig({T2S_BLUE_URL:upstream,T2S_BLUE_API_KEY:'test-only-key',T2S_TIMEOUT_MS:'1000',...env}));
  app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(()=>{app.closeAllConnections();app.close();fixture.server.closeAllConnections();fixture.server.close();});
  return {...fixture,base:`http://127.0.0.1:${app.address().port}`};
}
test('fixed upstream prefix, server-side key and request pagination preserved',async t=>{
  const s=await setup(t);const payload={question:'Films',question_hashed:'saved',page:2,rows_per_page:50,ui_language:'fr'};
  const r=await fetch(s.base+'/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':'browser-spoof','Cookie':'private=1'},body:JSON.stringify(payload)});
  assert.equal(r.status,200);assert.deepEqual(s.calls[0].input,payload);assert.equal(s.calls[0].path,'/root/search/text2sql');assert.equal(s.calls[0].headers['x-api-key'],'test-only-key');assert.equal(s.calls[0].headers.cookie,undefined);
});
test('safe config exposes deployment names, never key or upstream URL',async t=>{
  const s=await setup(t);const r=await fetch(s.base+'/client-config');const text=await r.text();
  assert.deepEqual(JSON.parse(text).apiColors,['blue']);assert.ok(!text.includes('test-only-key'));assert.ok(!text.includes('/root'));assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
});
test('only TMDb image delivery is opened externally; business requests stay same-origin',async t=>{
  const s=await setup(t,{T2S_BASE_PATH:'/t2s-web/'});
  const response=await fetch(s.base+'/t2s-web/');
  const policy=Object.fromEntries(response.headers.get('content-security-policy').split(';').map(part=>part.trim().split(/\s+/)).filter(([key])=>key).map(([key,...sources])=>[key,sources]));
  assert.deepEqual(policy['img-src'],["'self'",'blob:','data:','https://image.tmdb.org']);
  assert.deepEqual(policy['connect-src'],["'self'"]);
  assert.deepEqual(policy['frame-src'],["'none'"]);
  const config=await(await fetch(s.base+'/t2s-web/client-config')).json();
  assert.equal(config.mediaPolicy,'api-data-tmdb-cdn-images');
  assert.equal((await fetch(s.base+'/t2s-web/api/media/anything')).status,404);
  assert.equal(s.calls.length,0);
});
test('typed detail relation query reaches existing route unchanged',async t=>{
  const s=await setup(t);const r=await fetch(s.base+'/api/persons/202?ui_language=fr&collection=movie_cast&page=2&rows_per_page=50');
  assert.equal(r.status,200);assert.equal(s.calls[0].query.collection,'movie_cast');assert.equal(s.calls[0].query.page,'2');
});
test('API error envelopes survive HTTP 200, retry-after survives HTTP 429',async t=>{
  const s=await setup(t);
  for(const [question,status]of [['business error',200],['rate limit',429]]) {
    const r=await fetch(s.base+'/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
    assert.equal(r.status,status);if(status===200)assert.equal((await r.json()).error_code,'cache_miss');else assert.equal(r.headers.get('retry-after'),'2');
  }
});
test('raw upload and versioned image references work without multipart',async t=>{
  const s=await setup(t);const upload=await fetch(s.base+'/api/uploads/vision',{method:'POST',headers:{'Content-Type':'image/png'},body:picture});
  assert.equal(upload.status,200);assert.equal((await upload.json()).image_ref,imageRef);assert.deepEqual(s.calls[0].bytes,picture);
  const r=await fetch(s.base+'/api/uploads/vision/'+imageRef);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),picture);
});
test('cross-origin requests and forbidden capabilities never reach upstream',async t=>{
  const s=await setup(t);
  const rejected=[['/api/movies/1',{headers:{Origin:'https://unrelated.invalid'}}],['/api/movies/1?url=http://example.org',{}],['/api/movies/1?rows_per_page=201',{}],['/api/movies/1?page=1&page=2',{}],['/api/catalog/movies',{}],['/api/admin/evaluations',{}],['/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'x',sql_query:'DROP TABLE x'})}]];
  for(const [path,options]of rejected) assert.ok((await fetch(s.base+path,options)).status>=400,path);
  assert.equal(s.calls.length,0);
});
test('redirects are rejected rather than leaking the API key to another origin',async t=>{
  const s=await setup(t);const r=await fetch(s.base+'/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"question":"redirect"}'});
  assert.equal(r.status,502);assert.equal(s.calls.length,1);
});
test('private files and source files cannot be served',async t=>{
  const s=await setup(t);
  for(const path of ['/.env','/server.mjs','/package.json','/AGENTS.md','/test/fixtures.mjs','/api/movies%2F1'])assert.ok((await fetch(s.base+path)).status>=400,path);
});
test('allowlist excludes mutations and supports composite IDs and root version',()=>{
  assert.ok(routeAllowed('GET','/'));assert.ok(routeAllowed('GET','/seasons/301/0'));assert.ok(routeAllowed('GET','/episodes/301/0/1'));assert.ok(!routeAllowed('GET','/health'));assert.ok(!routeAllowed('DELETE','/movies/1'));assert.ok(!routeAllowed('POST','/movies/1'));
});
test('credential-bearing or non-HTTP upstream addresses are rejected',()=>{
  for(const url of ['file:///etc/passwd','http://user:pass@localhost','https://api.invalid/?key=secret'])assert.throws(()=>loadConfig({T2S_BLUE_URL:url}));
});
test('invalid search values never consume an upstream request',async t=>{
  const s=await setup(t);
  for(const change of [{page:-1},{page:1.2},{rows_per_page:0},{rows_per_page:1000000},{question:[]},{retrieve_from_cache:'false'},{ui_language:'xx'},{llm_model_vision:''},{image_ref:12}]) {
    const r=await fetch(s.base+'/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'Valid question',...change})});
    assert.equal(r.status,400,JSON.stringify(change));
  }
  assert.equal(s.calls.length,0);
});
test('version endpoint and samples use the actual upstream paths',async t=>{
  const s=await setup(t);
  const version=await fetch(s.base+'/api/');assert.equal((await version.json()).api_version,'fixture');
  const samples=await fetch(s.base+'/api/samples?set=showcase&ui_language=fr');assert.equal((await samples.json()).ui_language,'fr');
  assert.equal((await fetch(s.base+'/api/samples/42')).status,404);
});
test('unknown deployment, malformed JSON and wrong image format fail explicitly',async t=>{
  const s=await setup(t);
  assert.equal((await fetch(s.base+'/api/movies/1',{headers:{'X-T2S-Color':'green'}})).status,503);
  assert.equal((await fetch(s.base+'/api/search/text2sql',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(s.base+'/api/uploads/vision',{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:'<svg/>'})).status,415);
  assert.equal(s.calls.length,0);
});

test('base paths default to root, normalize their trailing slash and reject ambiguous input',()=>{
  assert.equal(loadConfig({}).basePath,'/');
  assert.equal(loadConfig({T2S_BASE_PATH:'/t2s-web'}).basePath,'/t2s-web/');
  assert.equal(loadConfig({T2S_BASE_PATH:'/apps/t2s-web/'}).basePath,'/apps/t2s-web/');
  for(const base of ['t2s-web','//t2s-web','/t2s-web//','/../','/%2f/','/t2s?x=1','/t2s#part','/t2s\\web','https://example.org/']) assert.throws(()=>loadConfig({T2S_BASE_PATH:base}),undefined,base);
});

test('prefixed entry redirects preserve queries before relative assets are resolved',async t=>{
  const s=await setup(t,{T2S_BASE_PATH:'/t2s-web'});
  for(const method of ['GET','HEAD']) {
    const r=await fetch(s.base+'/t2s-web?search=film%20fran%C3%A7ais&set=showcase',{method,redirect:'manual'});
    assert.equal(r.status,308);
    assert.equal(r.headers.get('location'),'/t2s-web/?search=film%20fran%C3%A7ais&set=showcase');
    assert.equal(await r.text(),'');
  }
});

test('prefixed assets, configuration, health and legacy entries share an isolated mount',async t=>{
  const s=await setup(t,{T2S_BASE_PATH:'/t2s-web/'});
  const entry=await fetch(s.base+'/t2s-web/');
  const html=await entry.text();
  assert.equal(entry.status,200);
  for(const [,asset] of html.matchAll(/(?:href|src)="(\.\/[^\"]+)"/g)) {
    const r=await fetch(new URL(asset,entry.url));
    assert.equal(r.status,200,asset);
  }
  for(const file of ['app.mjs','api.mjs','media.mjs','presentation.mjs','styles.css','legacy-routes.json','movie.php?movieid=101','t2slist.php?listid=2']) assert.equal((await fetch(s.base+'/t2s-web/'+file)).status,200,file);
  assert.equal((await (await fetch(s.base+'/t2s-web/client-config')).json()).basePath,'/t2s-web/');
  assert.equal((await (await fetch(s.base+'/t2s-web/health')).json()).status,'ok');
  for(const path of ['/','/health','/app.mjs','/client-config','/api/movies/101','/t2s-web-other/','/t2s-web/.env','/t2s-web/api/movies%2F101']) assert.ok((await fetch(s.base+path)).status>=400,path);
  assert.equal(s.calls.length,0);
});

test('prefixed gateway strips only its own mount and preserves API payloads and queries',async t=>{
  const s=await setup(t,{T2S_BASE_PATH:'/apps/t2s-web/'});
  const base=s.base+'/apps/t2s-web/api';
  const search=await fetch(base+'/search/text2sql',{method:'POST',headers:{Origin:s.base,'Content-Type':'application/json'},body:JSON.stringify({question:'Films',page:2})});
  assert.equal(search.status,200);
  assert.equal(s.calls[0].path,'/root/search/text2sql');
  assert.equal(s.calls[0].input.page,2);
  const relation=await fetch(base+'/movies/101?collection=cast&page=2&rows_per_page=2');
  assert.equal(relation.status,200);
  assert.equal(s.calls[1].path,'/root/movies/101');
  assert.deepEqual(s.calls[1].query,{collection:'cast',page:'2',rows_per_page:'2'});
  assert.equal((await fetch(base+'/uploads/vision',{method:'POST',headers:{'Content-Type':'image/png'},body:picture})).status,200);
  assert.deepEqual(Buffer.from(await (await fetch(base+'/uploads/vision/'+imageRef)).arrayBuffer()),picture);
  assert.equal((await fetch(base+'/movies/101',{headers:{Origin:'https://unrelated.invalid'}})).status,403);
  assert.equal((await fetch(base+'/admin/evaluations')).status,404);
  assert.equal(s.calls.length,4);
});
