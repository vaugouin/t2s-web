import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {tmdbImageURL,pickTmdbImage,imageLookupTarget,ImageDetailLoader} from './media.mjs';

test('TMDb raster paths and exact CDN URLs produce only approved size variants',()=>{
  assert.equal(tmdbImageURL('/abc123.jpg'),'https://image.tmdb.org/t/p/w342/abc123.jpg');
  assert.equal(tmdbImageURL('https://image.tmdb.org/t/p/original/portrait.png',{kind:'profile'}),'https://image.tmdb.org/t/p/w185/portrait.png');
  assert.equal(tmdbImageURL('/backdrop.webp',{kind:'backdrop',size:'w1280'}),'https://image.tmdb.org/t/p/w1280/backdrop.webp');
  assert.equal(tmdbImageURL('/photo.jpg',{kind:'profile',size:'w500'}),null);
  assert.equal(tmdbImageURL('/photo.jpg',{size:'w9999'}),null);
  assert.equal(tmdbImageURL('/photo.jpg',{size:'../original'}),null);
});

test('image URL boundary rejects unrelated hosts, credentials, traversal and URL decorations',()=>{
  for(const path of ['//image.tmdb.org/t/p/w500/a.jpg','http://image.tmdb.org/t/p/w500/a.jpg','https://image.tmdb.org.evil.invalid/t/p/w500/a.jpg','https://user@image.tmdb.org/t/p/w500/a.jpg','https://image.tmdb.org:443/t/p/w500/a.jpg','https://image.tmdb.org/t/p/w9999/a.jpg','https://image.tmdb.org/t/p/w500/../a.jpg','https://image.tmdb.org/t/p/w500/a.jpg?secret=x','https://image.tmdb.org/t/p/w500/a.jpg#x','https://upload.wikimedia.org/a.jpg','/uploads/vision/a.jpg','/../a.jpg','/%2e%2e/a.jpg','/foo%2Fbar.jpg','/a.jpg?x=1','/a.jpg#x','/a\\b.jpg','data:image/png;base64,x','/movie.html','a.jpg',' /a.jpg'])assert.equal(tmdbImageURL(path),null,path);
});

test('TMDb SVG logos are original-only and never used as posters or portraits',()=>{
  assert.equal(tmdbImageURL('/studio.svg',{kind:'logo'}),'https://image.tmdb.org/t/p/original/studio.svg');
  assert.equal(tmdbImageURL('https://image.tmdb.org/t/p/original/studio.svg',{kind:'logo'}),'https://image.tmdb.org/t/p/original/studio.svg');
  assert.equal(tmdbImageURL('https://image.tmdb.org/t/p/w500/studio.svg',{kind:'logo'}),null);
  assert.equal(tmdbImageURL('/studio.svg'),null);
  assert.equal(tmdbImageURL('/studio.svg',{kind:'profile'}),null);
  assert.equal(pickTmdbImage({LOGO_PATH:'/studio.svg'}).kind,'logo');
});

test('image selection uses typed fields and proven galleries without confusing other media',()=>{
  assert.equal(pickTmdbImage({PROFILE_PATH:'/portrait.jpg',POSTER_PATH:'/movie.jpg'},{kind:'person'}).field,'PROFILE_PATH');
  assert.equal(pickTmdbImage({POSTER_PATH:'https://evil.invalid/a.jpg',BACKDROP_PATH:'/backdrop.jpg'}).kind,'backdrop');
  assert.equal(pickTmdbImage({IMAGE_PATH:'/gallery.jpg'},{gallery:'backdrops'}).kind,'backdrop');
  assert.equal(pickTmdbImage({IMAGE_PATH:'/gallery.jpg'},{gallery:'portraits'}).kind,'profile');
  assert.equal(pickTmdbImage({POSTER_PATH:'/still.jpg',TYPE_IMAGE:'still'},{resultEntity:'serie_image'}).kind,'still');
  assert.equal(pickTmdbImage({IMAGE_URL:'https://image.tmdb.org/t/p/w500/known.jpg'}).field,'IMAGE_URL');
  for(const row of [{WIKIPEDIA_IMAGE_PATH:'/wiki.jpg'},{IMAGE_PATH:'/unknown.jpg'},{GENERATED_IMAGE_PATH:'/generated.jpg'},{image_ref:'private.jpg'},{THUMBNAIL_URL:'/unproven.jpg'},{FILE_URL:'https://upload.wikimedia.org/wiki.jpg'}])assert.equal(pickTmdbImage(row),null);
  assert.equal(pickTmdbImage({IMAGE_PATH:'/wiki.jpg',POSTER_PATH:'/wiki.jpg'},{gallery:'wikipedia_images'}),null);
  assert.equal(pickTmdbImage({THUMBNAIL_URL:'https://image.tmdb.org/t/p/w500/a.jpg'},{gallery:'videos'}),null);
});

test('detail image lookup uses exact API identities and never an image row or parent identity',()=>{
  assert.deepEqual(imageLookupTarget({ID_CONTENT:23,CONTENT_TYPE:'person'}).ids,['23']);
  assert.equal(imageLookupTarget({ID_CONTENT:23,CONTENT_TYPE:'person'}).kind,'person');
  assert.equal(imageLookupTarget({ID_COMPANY:8},{ID_SERIE:1,SEASON_NUMBER:2}).kind,'company');
  assert.deepEqual(imageLookupTarget({SEASON_NUMBER:0},{ID_SERIE:5}).ids,['5','0']);
  assert.equal(imageLookupTarget({ID_COLLECTION:3}),null);
  assert.equal(imageLookupTarget({ID_ROW:3}),null);
  assert.equal(imageLookupTarget({ID_MOVIE:0}),null);
  assert.equal(imageLookupTarget({ID_ROW:3,ID_MOVIE:9,IMAGE_PATH:null}),null);
  assert.equal(imageLookupTarget({ID_ROW:3,ID_PERSON:9,TYPE_IMAGE:'profile'}),null);
  assert.equal(imageLookupTarget({ID_MOVIE:9},{resultEntity:'movie_image'}),null);
  assert.equal(imageLookupTarget({TITLE:'Unknown'},{ID_MOVIE:9}),null);
});

const target=id=>({kind:'movie',ids:[String(id)]});
test('detail hydration deduplicates and bounds requests, with deployment/language-specific caching',async()=>{
  const calls=[];let active=0,max=0;
  const loader=new ImageDetailLoader((entity,options)=>new Promise(resolve=>{active++;max=Math.max(max,active);calls.push({entity,options,finish:data=>{active--;resolve(data);}});}),{maxConcurrent:2,maxEntries:8});
  const first=loader.get(target(1));assert.equal(loader.get(target(1)),first);
  const second=loader.get(target(2));const third=loader.get(target(3));
  assert.equal(calls.length,2);
  calls[0].finish({POSTER_PATH:'/one.jpg'});assert.equal((await first).field,'POSTER_PATH');
  assert.equal(calls.length,3);assert.equal(max,2);
  calls[1].finish({});calls[2].finish({POSTER_PATH:'/three.jpg'});await Promise.all([second,third]);
  assert.equal(await loader.get(target(2)),null);await loader.get(target(1));assert.equal(calls.length,3);
  const green=loader.get(target(1),{color:'green',language:'fr'});assert.equal(calls[3].options.color,'green');assert.equal(calls[3].options.language,'fr');calls[3].finish({POSTER_PATH:'/fr.jpg'});assert.match((await green).url,/fr\.jpg$/);
});

test('route cancellation aborts active hydration, drops queued work and does not poison later cache',async()=>{
  const calls=[];
  const loader=new ImageDetailLoader((entity,options)=>new Promise(resolve=>{calls.push({entity,options,resolve});}),{maxConcurrent:1});
  const old=loader.get(target(1));const queued=loader.get(target(2));loader.reset();
  assert.equal(await old,null);assert.equal(await queued,null);assert.equal(calls.length,1);assert.equal(calls[0].options.signal.aborted,true);
  calls[0].resolve({POSTER_PATH:'/stale.jpg'});await setImmediate();
  const fresh=loader.get(target(1));assert.equal(calls.length,2);calls[1].resolve({POSTER_PATH:'/fresh.jpg'});assert.match((await fresh).url,/fresh\.jpg$/);
});

test('hydration cache evicts oldest descriptors and retryable failures are not cached as missing images',async()=>{
  let calls=0;
  const loader=new ImageDetailLoader(async()=>{calls++;if(calls===1)throw Error('Temporary API failure');return {};},{maxEntries:2});
  await loader.get(target(1));await loader.get(target(1));assert.equal(calls,2);
  await loader.get(target(2));await loader.get(target(3));await loader.get(target(1));assert.equal(calls,5);
});
