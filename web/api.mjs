// DOM-free contract helpers. No upstream credentials or database access belong here.
export const MODEL_FIELDS = ['llm_model_entity_extraction', 'llm_model_text2sql', 'llm_model_complex', 'llm_model_result_entity', 'llm_model_vision'];
export const DETAIL_ROUTES = Object.freeze({movie:'movies',serie:'series',series:'series',season:'seasons',episode:'episodes',person:'persons',company:'companies',network:'networks',collection:'collections',topic:'topics',list:'lists',movement:'movements',technical:'technicals',genre:'genres',group:'groups',death:'deaths',award:'awards',nomination:'nominations',location:'locations'});
export function buildSearchRequest({question='',imageRef='',options={},page=1,questionHash}={}) {
  const body = {question:String(question).trim(),page:Math.max(1,Number(page)||1),rows_per_page:Math.min(200,Math.max(1,Number(options.rows_per_page)||50)),ui_language:options.ui_language==='fr'?'fr':'en',retrieve_from_cache:options.retrieve_from_cache!==false,store_to_cache:options.store_to_cache!==false,complex_question_processing:options.complex_question_processing===true};
  for (const field of MODEL_FIELDS) body[field]=String(options[field]||'default').trim()||'default';
  if(imageRef) body.image_ref=String(imageRef);
  if(questionHash) body.question_hashed=String(questionHash);
  return body;
}
export function flattenSamples(payload) {
  const result=[];
  const walk=(categories,trail=[])=>{for(const category of categories||[]){const path=[...trail,category.DESCRIPTION||String(category.ID_T2S_EVALUATION_CATEGORY||'')];for(const sample of category.samples||[])result.push({...sample,categoryPath:path});walk(category.categories,path);}};
  walk(payload?.categories); return result;
}
export function entityLink(row,context={}) {
  if(!row || typeof row!=='object') return null;
  const r={...context,...row};
  const has=k=>r[k]!==null && r[k]!==undefined && r[k]!=='';
  const numeric=k=>has(k)&&/^\d+$/.test(String(r[k]));
  const link=(kind,ids)=>({kind,ids:ids.map(String),href:`#/detail/${kind}/${ids.map(x=>encodeURIComponent(x)).join('/')}`});
  if(Object.hasOwn(row,'EPISODE_NUMBER')&&numeric('ID_SERIE')&&numeric('SEASON_NUMBER')&&numeric('EPISODE_NUMBER'))return link('episode',[r.ID_SERIE,r.SEASON_NUMBER,r.EPISODE_NUMBER]);
  if(Object.hasOwn(row,'SEASON_NUMBER')&&!Object.hasOwn(row,'EPISODE_NUMBER')&&numeric('ID_SERIE')&&numeric('SEASON_NUMBER'))return link('season',[r.ID_SERIE,r.SEASON_NUMBER]);
  const type=String(row.CONTENT_TYPE||row.ENTITY_TYPE||row.MEDIA_TYPE||'').toLowerCase();
  if(numeric('ID_CONTENT')&&['movie','serie','series','person'].includes(type))return link(type==='series'?'serie':type,[r.ID_CONTENT]);
  const fields=[['ID_MOVIE','movie'],['ID_SERIE','serie'],['ID_PERSON','person'],['ID_T2S_COLLECTION','collection'],['ID_T2S_LIST','list'],['ID_TOPIC','topic'],['ID_COMPANY','company'],['ID_NETWORK','network'],['ID_MOVEMENT','movement'],['ID_TECHNICAL','technical'],['ID_GENRE','genre'],['ID_GROUP','group'],['ID_DEATH','death'],['ID_AWARD','award'],['ID_NOMINATION','nomination'],['ID_LOCATION','location']];
  for(const [field,kind] of fields)if(Object.hasOwn(row,field)&&numeric(field))return link(kind,[r[field]]);
  return null;
}
export function mergeCollection(detail,targeted) {
  const name=targeted?.collection;
  if(!name || !Array.isArray(targeted[name]))throw new Error('Invalid targeted collection response');
  const old=detail.pagination?.[name]||{}, fresh=targeted.pagination?.[name]||{};
  // API currently reports total:0 on an empty out-of-range page.
  const meta={...old,...fresh};
  if(fresh.returned===0&&fresh.total===0&&old.total>0)meta.total=old.total;
  return {...detail,[name]:targeted[name],pagination:{...detail.pagination,[name]:meta}};
}
export class ApiError extends Error {
  constructor(message,status=0,body=null){super(message);this.name='ApiError';this.status=status;this.body=body;}
}
export class ApiClient {
  constructor({base='./api',color='blue',fetchImpl=(...args)=>globalThis.fetch(...args)}={}){this.base=base.replace(/\/$/,'');this.color=color;this.fetchImpl=fetchImpl;}
  async request(path,{method='GET',body,signal,raw=false}={}){
    if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid API path');
    const headers={'X-T2S-Color':this.color};
    if(body!==undefined)headers['Content-Type']=raw?(body.type||'application/octet-stream'):'application/json';
    const response=await this.fetchImpl(this.base+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),signal,credentials:'same-origin'});
    const ct=response.headers.get('content-type')||'';
    const data=ct.includes('json')?await response.json():await response.text();
    if(!response.ok){const message=typeof data==='string'?data:typeof data.detail==='string'?data.detail:data.error||JSON.stringify(data.detail||data);throw new ApiError(message||`HTTP ${response.status}`,response.status,data);}
    return data;
  }
  search(body,signal){return this.request('/search/text2sql',{method:'POST',body,signal});}
  upload(blob,signal){return this.request('/uploads/vision',{method:'POST',body:blob,raw:true,signal});}
  detail(kind,ids,params={},signal){
    const family=DETAIL_ROUTES[kind];
    if(!family||!Array.isArray(ids)||!ids.every(x=>/^\d+$/.test(String(x)))||ids.length!==(kind==='episode'?3:kind==='season'?2:1))throw new Error('Invalid entity identifier');
    return this.request(`/${family}/${ids.map(encodeURIComponent).join('/')}?${new URLSearchParams(params)}`,{signal});
  }
  samples(language='en',set='sample',signal){return this.request(`/samples?${new URLSearchParams({ui_language:language,set})}`,{signal});}
  async image(imageRef,signal){
    if(!/^[A-Za-z0-9._-]+$/.test(imageRef))throw new Error('Invalid image reference');
    const r=await this.fetchImpl(`${this.base}/uploads/vision/${encodeURIComponent(imageRef)}`,{headers:{'X-T2S-Color':this.color},signal,credentials:'same-origin'});
    if(!r.ok)throw new ApiError(`Photo: HTTP ${r.status}`,r.status);
    return r.blob();
  }
}
