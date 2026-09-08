// Entirely synthetic inputs, independent of private exports and today's clock.
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_COLUMNS, FIELDS, sha256 } from '../tools/p0-fact-batch/index.mjs';
export const CLOCK='2030-06-01T12:00:00.000Z';
export const clone=value=>JSON.parse(JSON.stringify(value));
const id=(kind,index)=>`${kind.toString(16).padStart(8,'0')}-0000-4000-8000-${index.toString(16).padStart(12,'0')}`;
export function fixture(count=1,{noop=[]}={}) {
  const rows=[],reviews=[];
  for(let index=1;index<=count;index++) {
    const eventId=10000+index,editionId=id(1,index),sourceId=id(2,index),url=`https://example.com/race-${index}`;
    const event={...Object.fromEntries(BASELINE_COLUMNS.event.map(key=>[key,null])),id:eventId,event_name:`Synthetic race ${index}`,canonical_name:`Synthetic race ${index}`,city:'Berlin',country:'Germany',address:'Synthetic race venue 1',latitude:'52.52000',longitude:'13.40500',sport:'Running',distance:'5 km',date:'02.06.2030',description:'This original synthetic description is deliberately long enough to be complete while not claiming any real event facts.',event_url:url,official_url:url,source_url:url,status:'approved',event_status:'active',publication_status:'published',registration_status:'registration_open',slug:`synthetic-${index}`,canonical_key:`synthetic-${index}`,needs_review:true,review_priority:'high',verification_status:'needs_review',data_confidence:0.8,quality_flags:{},created_at:'2029-01-01T00:00:00+00:00',updated_at:'2030-06-01T09:00:00+00:00',last_verified_at:'2030-05-01T00:00:00+00:00',next_check_at:'2030-05-31T00:00:00+00:00'};
    const edition={...Object.fromEntries(BASELINE_COLUMNS.edition.map(key=>[key,null])),id:editionId,event_id:eventId,edition_year:2030,edition_slug:`synthetic-${index}-2030`,legacy_event_key:`synthetic-${index}|02.06.2030|berlin|germany`,start_date:'2030-06-02',end_date:'2030-06-02',source_url:url,registration_url:url,registration_status:'registration_open',race_formats:[{label:'5 km',distance_km:5}],legacy_distance:'5 km',publication_status:'published',discovery_status:'active',edition_status:'scheduled',results_status:'not_expected',needs_review:true,review_priority:'high',verification_status:'needs_review',data_confidence:0.8,auto_publish_eligible:false,price_details:{},created_at:event.created_at,updated_at:event.updated_at,last_verified_at:event.last_verified_at,next_check_at:event.next_check_at};
    const source={...Object.fromEntries(BASELINE_COLUMNS.source.map(key=>[key,null])),id:sourceId,event_id:eventId,edition_id:editionId,source_url:url,source_type:'official_event_website',is_active:true,claimed_at:null,claimed_by:null,updated_at:event.updated_at};
    const patch=noop.includes(index)?{}:{description:'Diese synthetische Veranstaltung bietet einen vollständig beschriebenen Fünfkilometerlauf an einem erfundenen Testort. Sie dient ausschließlich lokalen technischen Prüfungen.'};
    const observed={event_name:event.canonical_name,edition_year:2030,date:edition.start_date,city:event.city,country:event.country,address:event.address,latitude:event.latitude,longitude:event.longitude,sport:event.sport,distances:clone(edition.race_formats),description:patch.description||event.description,registration_status:edition.registration_status,official_event_page:url,registration_link:url};
    const ref={url,file:'official.html',sha256:sha256('Synthetic primary source '+index),retrieved_at:'2030-06-01T11:00:00.123456+00:00'};
    const review={event_id:eventId,edition_id:editionId,source_id:sourceId,source_url:url,source_checked_at:ref.retrieved_at,confidence:0.95,notes:'Independently inspect all synthetic fields before any real attestation.',confirmed_fields:[...FIELDS],uncertain_fields:[],observed_values:observed,event_patch:patch,edition_patch:{},field_evidence:Object.fromEntries(FIELDS.map(key=>[key,{status:'supported',value:clone(observed[key]),evidence:[clone(ref)]}]))};
    rows.push({event_id:eventId,event,edition,sources:[source],sibling_editions:[clone(edition)],open_tasks:0,pending_proposals:0,active_source_jobs:0});
    reviews.push(review);
  }
  const baseline={retrieved_at:'2030-06-01T11:45:00.000Z',rows};
  const pins=reviews.map((review,i)=>({event_id:review.event_id,edition_id:review.edition_id,source_id:review.source_id,source_url:review.source_url,file:`event-${i+1}/review.json`,sha256:sha256(JSON.stringify(review))}));
  return {manifest:{schema_version:1,batch_id:'synthetic_p0_facts_20300601_test',prepared_at:CLOCK,baseline:{file:'baseline.json',sha256:sha256(JSON.stringify(baseline))},reviews:pins},baseline,reviews};
}
export function writeFixture(root,data=fixture()) {
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'baseline.json'),JSON.stringify(data.baseline));
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(data.manifest));
  data.reviews.forEach((review,i)=>{
    const dir=path.join(root,`event-${i+1}`);fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify(review));
    fs.writeFileSync(path.join(dir,'official.html'),'Synthetic primary source '+(i+1));
  });
  return path.join(root,'manifest.json');
}
