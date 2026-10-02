import {entityLink} from './api.mjs';

const ORIGIN='https://image.tmdb.org';
const SIZES={poster:['w92','w154','w185','w342','w500','w780','original'],profile:['w45','w185','h632','original'],backdrop:['w300','w780','w1280','original'],logo:['w45','w92','w154','w185','w300','w500','original'],still:['w92','w185','w300','original']};
const ALL_SIZES=new Set(Object.values(SIZES).flat());
const CARD_SIZE={poster:'w342',profile:'w185',backdrop:'w780',logo:'w300',still:'w300'};
const GALLERY_KIND={posters:'poster',backdrops:'backdrop',portraits:'profile',stills:'still',logos:'logo'};

// Deliberately accept only one TMDb file component, never arbitrary image URLs.
export function tmdbImageURL(value,{kind='poster',size=CARD_SIZE[kind]}={}) {
  if(typeof value!=='string'||!SIZES[kind]?.includes(size))return null;
  let path=value;
  if(path.startsWith('https://')){
    const match=path.match(/^https:\/\/image\.tmdb\.org\/t\/p\/([a-z0-9]+)(\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))$/i);
    if(!match||!ALL_SIZES.has(match[1]))return null;
    if(/\.svg$/i.test(match[2])&&match[1]!=='original')return null;
    path=match[2];
  }
  if(/\.svg$/i.test(path))return kind==='logo'&&/^\/[A-Za-z0-9_-]+\.svg$/i.test(path)?`${ORIGIN}/t/p/original${path}`:null;
  if(!/^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(path))return null;
  return `${ORIGIN}/t/p/${size}${path}`;
}

export function pickTmdbImage(row,{kind=null,gallery=null,resultEntity=null,size=null}={}) {
  if(!row||typeof row!=='object'||gallery==='wikipedia_images'||gallery==='videos')return null;
  const fields=kind==='person'?['PROFILE_PATH','POSTER_PATH','BACKDROP_PATH','LOGO_PATH','STILL_PATH']:['POSTER_PATH','PROFILE_PATH','LOGO_PATH','STILL_PATH','BACKDROP_PATH'];
  const kinds={POSTER_PATH:'poster',PROFILE_PATH:'profile',BACKDROP_PATH:'backdrop',LOGO_PATH:'logo',STILL_PATH:'still'};
  const imageType={poster:'poster',profile:'profile',backdrop:'backdrop',logo:'logo',still:'still'}[String(row.TYPE_IMAGE||'').toLowerCase()];
  const provenImage=GALLERY_KIND[gallery]||(['movie_image','serie_image','person_image'].includes(resultEntity)?imageType||({person_image:'profile'}[resultEntity]||'poster'):null);
  for(const field of fields){
    const imageKind=field==='POSTER_PATH'&&provenImage?provenImage:kinds[field];
    const url=tmdbImageURL(row[field],{kind:imageKind,...(size?{size}:{})});
    if(url)return {url,kind:imageKind,field};
  }
  if(provenImage){const url=tmdbImageURL(row.IMAGE_PATH,{kind:provenImage,...(size?{size}:{})});if(url)return {url,kind:provenImage,field:'IMAGE_PATH'};}
  for(const field of ['IMAGE_PATH','IMAGE_URL','FILE_URL','THUMBNAIL_URL'])if(typeof row[field]==='string'&&row[field].startsWith('https://image.tmdb.org/')){
    const imageKind=provenImage||imageType||(kind==='person'?'profile':'poster');
    const url=tmdbImageURL(row[field],{kind:imageKind,...(size?{size}:{})});if(url)return {url,kind:imageKind,field};
  }
  return null;
}

export function imageLookupTarget(row,context={}) {
  if(!row||typeof row!=='object'||Object.hasOwn(row,'TYPE_IMAGE')||Object.hasOwn(row,'IMAGE_PATH')||['movie_image','serie_image','person_image'].includes(context.resultEntity))return null;
  const target=entityLink(row,context);
  if(!target||!['movie','serie','season','episode','person','company','network','collection','list','topic','movement','group','death','award','nomination','location'].includes(target.kind)||!Number(target.ids[0]))return null;
  return target;
}

// Cache only selected public image descriptors, keyed by API deployment/language.
// Requests are bounded and deduplicated; reset cancels work when the view changes.
export class ImageDetailLoader {
  constructor(fetchDetail,{maxConcurrent=4,maxEntries=160}={}){this.fetchDetail=fetchDetail;this.maxConcurrent=maxConcurrent;this.maxEntries=maxEntries;this.cache=new Map();this.pending=new Map();this.queue=[];this.running=new Set();}
  get(target,{color='blue',language='en'}={}){
    const key=JSON.stringify([color,language,target.kind,target.ids]);
    if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return Promise.resolve(value);}
    if(this.pending.has(key))return this.pending.get(key).promise;
    if(this.pending.size>=this.maxEntries)return Promise.resolve(null);
    const job={key,target,color,language,controller:new AbortController()};
    job.promise=new Promise(resolve=>{job.resolve=resolve;});this.pending.set(key,job);this.queue.push(job);this.drain();return job.promise;
  }
  reset(){for(const job of this.pending.values()){job.controller.abort();job.resolve(null);}this.pending.clear();this.queue=[];}
  drain(){while(this.running.size<this.maxConcurrent&&this.queue.length){const job=this.queue.shift();this.running.add(job);this.run(job);}}
  async run(job){
    let image=null;
    try{
      const data=await this.fetchDetail(job.target,{color:job.color,language:job.language,signal:job.controller.signal});
      if(!job.controller.signal.aborted){image=pickTmdbImage(data,{kind:job.target.kind});this.cache.set(job.key,image);while(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);}
    }catch{ /* Missing images and unavailable detail services leave an honest fallback. */ }
    finally{if(this.pending.get(job.key)===job)this.pending.delete(job.key);this.running.delete(job);job.resolve(image);this.drain();}
  }
}
