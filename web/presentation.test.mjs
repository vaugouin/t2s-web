import test from 'node:test';
import assert from 'node:assert/strict';
import {groupCreditRows,detailHeading} from './presentation.mjs';

test('person filmography combines credit roles by ID without losing original rows or order',()=>{
  const rows=[
    {ID_MOVIE:101,MOVIE_TITLE:'Shared title',POSTER_PATH:null,CAST_CHARACTER:'Narrator',CREW_JOB:'Writer',CREW_DEPARTMENT:'Writing',DISPLAY_ORDER:1},
    {ID_MOVIE:102,MOVIE_TITLE:'Shared title',CREW_JOB:'Director'},
    {ID_MOVIE:101,MOVIE_TITLE:'Shared title',POSTER_PATH:'/poster.jpg',CAST_CHARACTER:'Self',CREW_JOB:'Producer',CREW_DEPARTMENT:'Production',DISPLAY_ORDER:2},
    {ID_MOVIE:101,MOVIE_TITLE:'Shared title',CAST_CHARACTER:'Narrator',CREW_JOB:'Writer',CREW_DEPARTMENT:'Writing',DISPLAY_ORDER:3},
  ];
  const original=structuredClone(rows);rows.forEach(Object.freeze);Object.freeze(rows);
  const result=groupCreditRows(rows,'movie_crew');
  assert.deepEqual(result.map(row=>row.ID_MOVIE),[101,102]);
  assert.equal(result[0].CAST_CHARACTER,'Narrator · Self');
  assert.equal(result[0].CREW_JOB,'Writer · Producer');
  assert.equal(result[0].CREW_DEPARTMENT,'Writing · Production');
  assert.equal(result[0].POSTER_PATH,'/poster.jpg');
  assert.deepEqual(result[0].CREDIT_ROWS,[original[0],original[2],original[3]]);
  assert.deepEqual(rows,original);
});

test('movie and series identities, missing IDs and unrelated relations never collapse by title',()=>{
  const rows=[{ID_SERIE:9,SERIE_TITLE:'Same'},{ID_SERIE:9,SERIE_TITLE:'Same',CAST_CHARACTER:'Lead'},{ID_SERIE:10,SERIE_TITLE:'Same'},{ID_ROW:9,SERIE_TITLE:'Same'},{ID_ROW:9,SERIE_TITLE:'Same'},{ID_MOVIE:9,MOVIE_TITLE:'Same'}];
  assert.equal(groupCreditRows(rows,'series_cast').length,5);
  assert.equal(groupCreditRows(rows,'movie_cast').length,6);
  assert.equal(groupCreditRows(rows,'similar'),rows);
  assert.equal(groupCreditRows([{ID_MOVIE:0},{ID_MOVIE:0}],'movie_cast').length,2);
});

test('cast, crew and different pages are grouped independently without changing API pagination',()=>{
  const detail={movie_cast:[{ID_MOVIE:1,CAST_CHARACTER:'Hero'},{ID_MOVIE:1,CAST_CHARACTER:'Narrator'}],movie_crew:[{ID_MOVIE:1,CREW_JOB:'Writer'},{ID_MOVIE:1,CREW_JOB:'Director'}],pagination:{movie_crew:{total:12,page:1,rows_per_page:2,returned:2}}};
  const original=structuredClone(detail);
  const cast=groupCreditRows(detail.movie_cast,'movie_cast'),crew=groupCreditRows(detail.movie_crew,'movie_crew');
  assert.equal(cast[0].CAST_CHARACTER,'Hero · Narrator');assert.equal(cast[0].CREW_JOB,undefined);
  assert.equal(crew[0].CREW_JOB,'Writer · Director');assert.equal(crew[0].CAST_CHARACTER,undefined);
  const page2=groupCreditRows([{ID_MOVIE:1,CREW_JOB:'Editor'},{ID_MOVIE:2,CREW_JOB:'Writer'}],'movie_crew');
  assert.deepEqual(page2.map(row=>row.ID_MOVIE),[1,2]);assert.equal(page2[0].CREW_JOB,'Editor');
  assert.deepEqual(detail,original);
});

test('typed mixed-content IDs can group while primitives and unknown rows stay intact',()=>{
  const rows=[{ID_CONTENT:8,CONTENT_TYPE:'serie',CREW_JOB:'Writer'},{ID_CONTENT:8,CONTENT_TYPE:'serie',CREW_JOB:'Director'},null,'unknown',{TITLE:'Unidentified'},{TITLE:'Unidentified'}];
  const result=groupCreditRows(rows,'series_crew');
  assert.equal(result.length,5);assert.equal(result[0].CREW_JOB,'Writer · Director');assert.equal(result[1],null);assert.equal(result[2],'unknown');
});

test('movie detail heading uses actual release year, preserves title and ignores invalid dates',()=>{
  assert.equal(detailHeading('Film',{DAT_RELEASE:'1999-03-31'},'movie'),'Film (1999)');
  assert.equal(detailHeading('Film',{DAT_RELEASE:'1999-03-31T00:00:00Z',RELEASE_YEAR:2000},'movie'),'Film (1999)');
  assert.equal(detailHeading('Film',{DAT_RELEASE:null,RELEASE_YEAR:2001},'movie'),'Film (2001)');
  for(const date of ['0000-00-00','2023-02-29','2024-13-01','2024-00-01','2024-01-32','tomorrow',null])assert.equal(detailHeading('Film',{DAT_RELEASE:date},'movie'),'Film');
  assert.equal(detailHeading('Person',{DAT_RELEASE:'1999-03-31'},'person'),'Person');
});

test('series headings show returned year span and explicit ongoing status without invented end year',()=>{
  assert.equal(detailHeading('Series',{DAT_FIRST_AIR:'2010-05-01',DAT_LAST_AIR:'2018-06-02',STATUS:'Ended'},'serie'),'Series (2010–2018)');
  assert.equal(detailHeading('Series',{FIRST_AIR_YEAR:2010,LAST_AIR_YEAR:2018,STATUS:'Canceled'},'serie'),'Series (2010–2018)');
  assert.equal(detailHeading('Series',{DAT_FIRST_AIR:'2010-05-01',DAT_LAST_AIR:'2024-06-02',STATUS:'Returning Series'},'serie'),'Series (2010–present)');
  assert.equal(detailHeading('Series',{FIRST_AIR_YEAR:2010,STATUS:'In Production'},'serie','fr'),'Series (2010–en cours)');
  assert.equal(detailHeading('Series',{FIRST_AIR_YEAR:2010},'serie'),'Series (2010–?)');
  assert.equal(detailHeading('Series',{LAST_AIR_YEAR:2018},'serie'),'Series (?–2018)');
  assert.equal(detailHeading('Series',{FIRST_AIR_YEAR:2018,LAST_AIR_YEAR:2010},'serie'),'Series (2018–?)');
  assert.equal(detailHeading('Series',{FIRST_AIR_YEAR:2018,LAST_AIR_YEAR:2018},'serie'),'Series (2018–2018)');
  assert.equal(detailHeading('Series',{STATUS:'Returning Series'},'serie'),'Series');
});
