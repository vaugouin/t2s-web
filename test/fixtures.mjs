import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
export const imageRef='20261002-123456_vision_1.1.19_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
export const picture=readFileSync(new URL('./vision-fixture.png',import.meta.url));
export const movie={ID_MOVIE:101,MOVIE_TITLE:'The Glass Observatory',OVERVIEW:'A synthetic test story, not catalogue data.',DAT_RELEASE:'2024-04-15',POSTER_PATH:'/fixture-poster.jpg',ID_WIKIDATA:'Q123',BUDGET:42000000};
export const person={ID_PERSON:202,PERSON_NAME:'Avery Test',BIOGRAPHY:'A synthetic person used only in tests.'};
export function fixtureApi() {
  const calls=[];
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture');const parts=[];
    for await(const part of req)parts.push(part);
    const bytes=Buffer.concat(parts); let input;
    try { input=JSON.parse(bytes.toString()); } catch { input=null; }
    calls.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),headers:req.headers,input,bytes});
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(url.pathname==='/root/') return send({message:'Synthetic API fixture',api_version:'fixture',bktrees_ready:true});
    if(url.pathname==='/root/search/text2sql') {
      if(input?.question==='business error')return send({error:'The saved question expired.',error_code:'cache_miss',is_retryable:false,result:[]});
      if(input?.question==='redirect') {res.writeHead(302,{Location:'http://127.0.0.1:1/'});res.end();return;}
      if(input?.question==='rate limit') {res.setHeader('Retry-After','2');return send({detail:'Too many requests'},429);}
      return send({question:input.question,question_hashed:'fixture-hash',page:input.page,rows_per_page:input.rows_per_page,result_entity:'movie',answer:'Synthetic response for interface verification.',justification:'Local fixture only.',sql_query:'SELECT ID_MOVIE, MOVIE_TITLE FROM synthetic_fixture',result:input.page>1?[]:[{index:1,data:movie}],messages:[{position:1,text:'No production request was made.'}],llm_usage:{},name_ambiguity:null});
    }
    if(url.pathname==='/root/uploads/vision'&&req.method==='POST')return send({image_ref:imageRef,bytes:bytes.length,image_format:'PNG',deposited_at:'2026-10-02T12:34:56Z',purge_after:'2026-11-01T12:34:56Z',retention_days:30});
    if(url.pathname===`/root/uploads/vision/${imageRef}`) {res.writeHead(200,{'Content-Type':'image/png'});res.end(picture);return;}
    if(url.pathname==='/root/samples')return send({ui_language:url.searchParams.get('ui_language')||'en',set:url.searchParams.get('set')||'showcase',categories:[{ID_T2S_EVALUATION_CATEGORY:1,DESCRIPTION:'Synthetic examples',categories:[],samples:[{ID_T2S_EVALUATION:1,QUESTION:'A synthetic film question',IS_SHOWCASE:1,assertion:{result_entity:'movie'},simulated_result:{result_entity:'movie',result:[{index:1,data:movie}]}},{ID_T2S_EVALUATION:2,QUESTION:'An incomplete example',IS_SHOWCASE:1,assertion:null,simulated_result:null}]}]});
    const match=url.pathname.match(/^\/root\/(movies|persons|series|companies|networks|collections|topics|lists|movements|technicals|genres|groups|deaths|awards|nominations|locations|seasons|episodes)\/(.+)$/);
    if(match) {
      const collection=url.searchParams.get('collection');const page=Number(url.searchParams.get('page')||1);
      if(collection)return send({id:Number(match[2].split('/')[0]),collection,[collection]:page===2?[{...person,ID_PERSON:203,PERSON_NAME:'Robin Fixture'}]:[],pagination:{[collection]:{total:page===2?3:0,page,rows_per_page:2,returned:page===2?1:0}}});
      return send({...movie,cast:[person,{...person,ID_PERSON:204,PERSON_NAME:'Sage Fixture'}],companies:[],seasons:[{ID_SERIE:301,SEASON_NUMBER:0,SEASON_NAME:'Specials'},{ID_SERIE:301,SEASON_NUMBER:1,SEASON_NAME:'Season one'}],pagination:{cast:{total:3,page:1,rows_per_page:2,returned:2}},wikipedia_content:[{title:'Introduction',content:'Plain article text. <script>window.untrusted=true</script>'}],wikipedia_page:{lang:'en',title:'Synthetic fixture',url:'https://en.wikipedia.org/wiki/Example'},posters:[{IMAGE_PATH:'/not-fetched.jpg',LANG:'en'}],videos:[{VIDEO_NAME:'External trailer metadata',VIDEO_SITE:'YouTube',WATCH_URL:'https://www.youtube.com/watch?v=example'}],data_freshness:{movie:{status:'collected',collected_at:'2026-10-01T00:00:00Z'}}});
    }
    send({detail:'Fixture endpoint missing'},404);
  });
  return {server,calls};
}
