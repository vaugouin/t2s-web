import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const WEB = new URL('./web/', import.meta.url);
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_JSON = 256 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;
const DETAIL = /^\/(movies|series|persons|companies|networks|collections|topics|lists|movements|technicals|genres|groups|deaths|awards|nominations|locations)\/[1-9]\d*$/;
const COMPOSITE = /^\/(seasons\/[1-9]\d*\/\d+|episodes\/[1-9]\d*\/\d+\/\d+)$/;
const UPLOAD = /^\/uploads\/vision\/\d{8}-\d{6}_vision_[A-Za-z0-9][A-Za-z0-9._-]*_[0-9a-f]{32}\.(?:jpg|png|webp)$/;
const SEARCH_FIELDS = new Set(['question','question_hashed','image_ref','page','rows_per_page','ui_language','retrieve_from_cache','store_to_cache','complex_question_processing', ...['entity_extraction','text2sql','complex','result_entity','answer_single_value','vision'].map(x=>'llm_model_'+x)]);
const STATIC = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs','text/javascript; charset=utf-8']],
  ['/api.mjs', ['api.mjs','text/javascript; charset=utf-8']],
  ['/media.mjs', ['media.mjs','text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css','text/css; charset=utf-8']],
  ['/legacy-routes.json', ['legacy-routes.json','application/json; charset=utf-8']],
]);

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function headers(res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https://image.tmdb.org; media-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
}
function json(res,status,value) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(value));
}
async function bounded(stream, limit, status=413) {
  const parts=[]; let size=0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size>limit) throw fail(status,status===502?'The upstream response exceeds the supported size.':'Payload exceeds the supported size.');
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}
export function routeAllowed(method,path) {
  if (method==='POST') return path==='/search/text2sql'||path==='/uploads/vision';
  return method==='GET' && (DETAIL.test(path)||COMPOSITE.test(path)||UPLOAD.test(path)||path==='/samples'||path==='/');
}
export function loadConfig(env=process.env) {
  const rawBasePath=env.T2S_BASE_PATH||'/';
  if(!/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?)?$/.test(rawBasePath)) throw new Error('T2S_BASE_PATH must be an absolute path of letters, numbers, underscores or hyphens.');
  const basePath=rawBasePath.endsWith('/')?rawBasePath:rawBasePath+'/';
  const upstreams={};
  for(const color of ['blue','green']) {
    const raw=env[`T2S_${color.toUpperCase()}_URL`];
    if(!raw) continue;
    const url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('Upstream must be an HTTP(S) base URL without credentials, query or fragment.');
    url.pathname=url.pathname.replace(/\/+$/,'')+'/';
    upstreams[color]={url,key:env[`T2S_${color.toUpperCase()}_API_KEY`]||''};
  }
  const timeout=Number(env.T2S_TIMEOUT_MS||180000);
  if(!Number.isSafeInteger(timeout)||timeout<100||timeout>600000) throw new Error('T2S_TIMEOUT_MS must be 100–600000.');
  return {upstreams,timeout,basePath};
}
function validateParams(path, params) {
  const permitted = path==='/samples'?new Set(['set','ui_language']):DETAIL.test(path)||COMPOSITE.test(path)?new Set(['ui_language','collection','page','rows_per_page']):new Set();
  for(const key of params.keys()) {
    if(!permitted.has(key)||params.getAll(key).length!==1) throw fail(400,'Unsupported or duplicate API parameter.');
  }
  for(const key of ['page','rows_per_page']) if(params.has(key)) {
    const value=params.get(key);
    if(!/^[1-9]\d*$/.test(value)||Number(value)>(key==='rows_per_page'?200:1000000)) throw fail(400,'Invalid pagination.');
  }
  if(params.has('ui_language')&&!['en','fr'].includes(params.get('ui_language'))) throw fail(400,'Unsupported language.');
  if(params.has('set')&&!['sample','showcase'].includes(params.get('set'))) throw fail(400,'Unsupported sample set.');
  if(params.has('collection')&&!/^[a-z_]+$/.test(params.get('collection'))) throw fail(400,'Invalid relationship collection.');
}
function sameOrigin(req) {
  if(req.headers['sec-fetch-site']==='cross-site') throw fail(403,'Cross-origin requests are not allowed.');
  if(req.headers.origin) {
    let origin;
    try { origin=new URL(req.headers.origin); } catch { throw fail(403,'Invalid origin.'); }
    if(origin.host!==req.headers.host) throw fail(403,'Cross-origin requests are not allowed.');
  }
}
function validateSearch(value) {
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!SEARCH_FIELDS.has(k))) throw fail(400,'Unsupported search field.');
  for(const key of ['question','question_hashed','image_ref']) {
    if(value[key]!=null&&(typeof value[key]!=='string'||value[key].length>(key==='question'?16000:512))) throw fail(400,'Invalid search text or reference.');
  }
  for(const key of ['page','rows_per_page']) if(value[key]!==undefined) {
    if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>(key==='page'?1000000:200)) throw fail(400,'Invalid search pagination.');
  }
  for(const key of ['retrieve_from_cache','store_to_cache','complex_question_processing']) if(value[key]!==undefined&&typeof value[key]!=='boolean') throw fail(400,'Invalid search option.');
  if(value.ui_language!==undefined&&!['en','fr'].includes(value.ui_language)) throw fail(400,'Unsupported language.');
  for(const key of SEARCH_FIELDS) if(key.startsWith('llm_model_')&&value[key]!==undefined&&(typeof value[key]!=='string'||!value[key].trim()||value[key].length>200)) throw fail(400,'Invalid model override.');
  if(!['question','question_hashed','image_ref'].some(k=>typeof value[k]==='string'&&value[k].trim())) throw fail(400,'A question or image reference is required.');
}
export function createApp(config=loadConfig()) {
  const basePath=config.basePath||'/';
  return createServer(async(req,res)=>{
    headers(res);
    try {
      // Decode nothing before routing; encoded separators and path traversal are rejected.
      if(!req.url?.startsWith('/')||req.url.startsWith('//')||req.url.split('?')[0].includes('%')||req.url.split('?')[0].includes('..')||req.url.includes('\\')) throw fail(400,'Invalid request path.');
      const url=new URL(req.url,'http://client.local');
      const method=req.method||'GET';
      if(basePath!=='/'&&url.pathname===basePath.slice(0,-1)&&['GET','HEAD'].includes(method)) {
        res.writeHead(308,{Location:basePath+url.search});res.end();return;
      }
      if(!url.pathname.startsWith(basePath)) throw fail(404,'Page not found.');
      const pathname='/'+url.pathname.slice(basePath.length);
      if(pathname==='/health'&&method==='GET') return json(res,200,{status:'ok',service:'t2s-web'});
      if(pathname==='/client-config'&&method==='GET') return json(res,200,{
        basePath,
        apiColors:Object.entries(config.upstreams).filter(([,v])=>v.key).map(([k])=>k),
        configured:Object.values(config.upstreams).some(v=>v.key),
        maxImageBytes:MAX_UPLOAD,
        mediaPolicy:'api-data-tmdb-cdn-images',
      });
      if(pathname.startsWith('/api/')) {
        sameOrigin(req);
        const path=pathname.slice(4);
        if(!routeAllowed(method,path)) throw fail(404,'This API capability is not available in this client.');
        validateParams(path,url.searchParams);
        const color=req.headers['x-t2s-color']||'blue';
        if(!['blue','green'].includes(color)) throw fail(400,'Unknown API deployment.');
        const upstream=config.upstreams[color];
        if(!upstream?.key) throw fail(503,'Configure this API deployment and its server-side key first.');
        const target=new URL(path.slice(1),upstream.url);
        target.search=url.search;
        const requestHeaders={'X-API-Key':upstream.key,'Accept':UPLOAD.test(path)?'image/*':'application/json'};
        let body;
        if(method==='POST') {
          const type=(req.headers['content-type']||'').split(';')[0].toLowerCase();
          if(path==='/search/text2sql') {
            if(type!=='application/json') throw fail(415,'Search requires JSON.');
            body=await bounded(req,MAX_JSON);
            let value;
            try { value=JSON.parse(body); } catch { throw fail(400,'Invalid JSON.'); }
            validateSearch(value);
          } else {
            if(!['image/jpeg','image/png','image/webp'].includes(type)) throw fail(415,'Choose a JPEG, PNG or WebP image.');
            body=await bounded(req,MAX_UPLOAD);
            if(!body.length) throw fail(400,'The image is empty.');
          }
          requestHeaders['Content-Type']=type;
        }
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),config.timeout);
        const disconnect=()=>{if(!res.writableEnded)controller.abort();};
        res.on('close',disconnect);
        try {
          const reply=await fetch(target,{method,headers:requestHeaders,body,redirect:'manual',signal:controller.signal});
          if(reply.status>=300&&reply.status<400) throw fail(502,'The upstream API returned an unexpected redirect.');
          const contentType=(reply.headers.get('content-type')||'application/octet-stream').split(';')[0];
          if(!['application/json','image/jpeg','image/png','image/webp'].includes(contentType)) throw fail(502,'The upstream returned an unsupported response format.');
          const data=await bounded(reply.body,MAX_RESPONSE,502);
          const outgoing={'Content-Type':contentType};
          if(reply.headers.has('retry-after')) outgoing['Retry-After']=reply.headers.get('retry-after');
          res.writeHead(reply.status,outgoing);res.end(data);
        } catch(error) {
          if(error.status) throw error;
          throw fail(controller.signal.aborted?504:502,controller.signal.aborted?'The API request timed out or was cancelled.':'The API could not be reached.');
        } finally { clearTimeout(timer);res.off('close',disconnect); }
        return;
      }
      if(!['GET','HEAD'].includes(method)) throw fail(405,'Method not allowed.');
      let asset=STATIC.get(pathname);
      if(!asset&&/^\/[a-z0-9-]+\.php$/.test(pathname)) {
        const registry=JSON.parse(await readFile(new URL('legacy-routes.json',WEB),'utf8'));
        if((Array.isArray(registry)?registry:registry.routes).some(route=>'/'+route.file===pathname)) asset=STATIC.get('/');
      }
      if(!asset) throw fail(404,'Page not found.');
      const data=await readFile(new URL(asset[0],WEB));
      res.writeHead(200,{'Content-Type':asset[1]});res.end(method==='HEAD'?undefined:data);
    } catch(error) {
      if(!res.headersSent&&!res.destroyed) json(res,error.status||500,{error: error.status?error.message:'The client could not complete this request.'});
      else if(!res.destroyed) res.end();
    }
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=process.env.HOST||'127.0.0.1';const port=Number(process.env.PORT||4180);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT.');
  const config=loadConfig();
  createApp(config).listen(port,host,()=>console.log(`t2s-web listening on http://${host}:${port}${config.basePath}`));
}
