import {entityLink} from './api.mjs';

export const PERSON_CREDIT_RELATIONS=new Set(['movie_cast','movie_crew','series_cast','series_crew']);
export const CREDIT_ROLE_FIELDS=['CAST_CHARACTER','CREW_JOB','CREW_DEPARTMENT'];

// This operates on one returned relation page only. API totals remain credit counts.
export function groupCreditRows(rows,relation){
  if(!PERSON_CREDIT_RELATIONS.has(relation))return rows;
  const expected=relation.startsWith('movie_')?'movie':'serie';
  const groups=[],byIdentity=new Map();
  for(const row of rows){
    const target=entityLink(row);
    const key=target?.kind===expected&&/^[1-9]\d*$/.test(target.ids[0])?`${target.kind}:${target.ids[0]}`:null;
    let group=key?byIdentity.get(key):null;
    if(!group){group=[];groups.push(group);if(key)byIdentity.set(key,group);}
    group.push(row);
  }
  return groups.map(group=>{
    if(group.length===1)return group[0];
    const merged={...group[0]};
    for(const row of group)for(const [key,value]of Object.entries(row))if((merged[key]===null||merged[key]===undefined||merged[key]==='')&&value!==null&&value!==undefined&&value!=='')merged[key]=value;
    for(const field of CREDIT_ROLE_FIELDS){
      const values=[...new Set(group.flatMap(row=>Array.isArray(row[field])?row[field]:[row[field]]).filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean))];
      if(values.length)merged[field]=values.join(' · ');
    }
    merged.CREDIT_ROWS=group.map(row=>({...row}));
    return merged;
  });
}

function yearValue(value){return /^(?:[1-9]\d{3})$/.test(String(value??''))?String(value):null;}
function dateYear(value){
  if(typeof value!=='string')return null;
  const match=value.match(/^([1-9]\d{3})-(\d{2})-(\d{2})(?:[T ][0-9:.+Z-]+)?$/);
  if(!match)return yearValue(value);
  const [,year,month,day]=match.map(Number);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return null;
  return String(year);
}

export function detailHeading(title,data,kind,language='en'){
  if(kind==='movie'){
    const year=dateYear(data.DAT_RELEASE)||yearValue(data.RELEASE_YEAR);
    return year?`${title} (${year})`:title;
  }
  if(kind!=='serie'&&kind!=='series')return title;
  const start=dateYear(data.DAT_FIRST_AIR)||yearValue(data.FIRST_AIR_YEAR);
  let end=dateYear(data.DAT_LAST_AIR)||yearValue(data.LAST_AIR_YEAR);
  if(start&&end&&Number(end)<Number(start))end=null;
  const ongoing=['returning series','in production'].includes(String(data.STATUS||'').trim().toLowerCase());
  if(!start&&!end)return title;
  return `${title} (${start||'?'}–${ongoing?(language==='fr'?'en cours':'present'):end||'?'})`;
}
