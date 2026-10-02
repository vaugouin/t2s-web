import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiClient,ApiError,MODEL_FIELDS,buildSearchRequest,flattenSamples,entityLink,mergeCollection} from './api.mjs';

test('pagination keeps the original question, photo reference, hash and all model/cache options',()=>{
  const options={ui_language:'fr',retrieve_from_cache:false,store_to_cache:false,complex_question_processing:true,rows_per_page:25,...Object.fromEntries(MODEL_FIELDS.map((key,i)=>[key,`model-${i}`]))};
  const first=buildSearchRequest({question:'What is this film?',imageRef:'photo.jpg',options});
  const second=buildSearchRequest({question:first.question,imageRef:first.image_ref,options:first,page:2,questionHash:'composed-hash'});
  assert.deepEqual(second,{...first,page:2,question_hashed:'composed-hash'});
  assert.equal(second.ui_language,'fr');
  assert.equal(Object.hasOwn(second,'watch_country'),false);
});

test('request helper uses API defaults and excludes internal retry state',()=>{
  const body=buildSearchRequest({imageRef:'photo.jpg',options:{complex_retry_seed:{unsafe:true},complex_question_already_resolved:true,rows_per_page:1000}});
  assert.equal(body.rows_per_page,200);
  for(const key of MODEL_FIELDS)assert.equal(body[key],'default');
  assert.equal(Object.hasOwn(body,'complex_retry_seed'),false);
  assert.equal(Object.hasOwn(body,'complex_question_already_resolved'),false);
});

test('targeted relation pagination preserves all other detail sections and known out-of-range totals',()=>{
  const detail={MOVIE_TITLE:'Fixture',cast:[{ID_PERSON:1}],crew:[{ID_PERSON:2}],pagination:{cast:{total:3,page:1,rows_per_page:2,returned:2},crew:{total:1,page:1}}};
  const next=mergeCollection(detail,{collection:'cast',cast:[],pagination:{cast:{total:0,page:3,rows_per_page:2,returned:0}}});
  assert.equal(next.MOVIE_TITLE,'Fixture');assert.deepEqual(next.crew,detail.crew);assert.equal(next.pagination.cast.total,3);assert.equal(next.pagination.cast.page,3);assert.deepEqual(next.pagination.crew,detail.pagination.crew);assert.equal(detail.pagination.cast.page,1);
  assert.throws(()=>mergeCollection(detail,{collection:'cast',cast:'invalid'}));
});

test('entity navigation distinguishes mixed content, T2S identifiers and composite TV keys',()=>{
  assert.equal(entityLink({ID_CONTENT:7,CONTENT_TYPE:'serie'}).href,'#/detail/serie/7');
  assert.equal(entityLink({ID_T2S_COLLECTION:8}).href,'#/detail/collection/8');
  assert.equal(entityLink({ID_COLLECTION:8}),null);
  assert.equal(entityLink({ID_LOCATION:9,ID_WIKIDATA:'Q1'}).href,'#/detail/location/9');
  assert.equal(entityLink({ID_ROW:9,POSTER_PATH:'/image.jpg'}),null);
  assert.equal(entityLink({ID_EPISODE:5,EPISODE_NUMBER:2},{ID_SERIE:1,SEASON_NUMBER:0}).href,'#/detail/episode/1/0/2');
  assert.equal(entityLink({ID_SEASON:5,SEASON_NUMBER:0},{ID_SERIE:1}).href,'#/detail/season/1/0');
  assert.equal(entityLink({ID_PERSON:42},{ID_SERIE:1,SEASON_NUMBER:1}).href,'#/detail/person/42');
  assert.equal(entityLink({ID_MOVIE:'<script>'}),null);
});

test('sample flattening preserves nested category paths, simulations and flags',()=>{
  const sample={ID_T2S_EVALUATION:4,QUESTION:'Question',IS_SHOWCASE:1,simulated_result:{result_kind:'bound',expectation:{operator:'NOT IN',value:[5]},result:[]}};
  const flat=flattenSamples({categories:[{DESCRIPTION:'A',samples:[],categories:[{DESCRIPTION:'B',samples:[sample],categories:[]}]}]});
  assert.deepEqual(flat,[{...sample,categoryPath:['A','B']}]);assert.deepEqual(flattenSamples({}),[]);
});

test('client sends binary upload and color header without credentials in JSON',async()=>{
  let seen;const blob=new Blob(['fixture'],{type:'image/png'});
  const client=new ApiClient({color:'green',fetchImpl:async(url,options)=>{seen={url,options};return Response.json({image_ref:'ref.png'});}});
  assert.deepEqual(await client.upload(blob),{image_ref:'ref.png'});
  assert.equal(seen.url,'./api/uploads/vision');assert.equal(seen.options.body,blob);assert.equal(seen.options.headers['Content-Type'],'image/png');assert.equal(seen.options.headers['X-T2S-Color'],'green');assert.equal(seen.options.headers['X-API-Key'],undefined);
});

test('HTTP-200 business errors remain available for faithful UI rendering; HTTP errors are typed',async()=>{
  const body={error:'Expired cache',error_code:'cache_miss',is_retryable:true,result:[]};
  assert.deepEqual(await new ApiClient({fetchImpl:async()=>Response.json(body)}).search({question:'fixture'}),body);
  const bad=new ApiClient({fetchImpl:async()=>Response.json({detail:'Photo expired'},{status:410})});
  await assert.rejects(()=>bad.search({question:'fixture'}),error=>error instanceof ApiError&&error.status===410&&error.message==='Photo expired');
});

test('native fetch default retains the global receiver used by browsers',async()=>{
  const original=globalThis.fetch;
  try{globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve(Response.json({ok:true}));};assert.deepEqual(await new ApiClient().request('/'),{ok:true});}
  finally{globalThis.fetch=original;}
});

test('detail client validates path components and encodes only supported route families',async()=>{
  let url;const client=new ApiClient({fetchImpl:async(path)=>{url=path;return Response.json({});}});
  await client.detail('episode',[12,0,2],{collection:'cast',page:2,ui_language:'fr'});
  assert.equal(url,'./api/episodes/12/0/2?collection=cast&page=2&ui_language=fr');
  assert.throws(()=>client.detail('unknown',[1]));assert.throws(()=>client.detail('movie',['../secrets']));assert.throws(()=>client.detail('episode',[1]));
});
