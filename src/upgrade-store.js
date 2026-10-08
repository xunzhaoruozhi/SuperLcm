// 0.5.21 could put compaction nodes beside a custom database filename.
// Recover only sessions already known to the selected archive, without touching
// source files or overwriting destination nodes. Repeat mounts are idempotent.
import {DatabaseSync} from 'node:sqlite'
import {existsSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {rowToNode} from './store.js'
const has=(db,table)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
export function recoverMisplacedNodes(target){
 const result={recovered:0,drafts:0,conflicts:0},source=join(dirname(target.path),'lcm.sqlite')
 if(resolve(source)===target.path||!existsSync(source))return result
 const destination=new DatabaseSync(target.path,{readOnly:true}),known=new Set()
 try{
  if(has(destination,'sl_sessions'))for(const row of destination.prepare('SELECT id FROM sl_sessions').all())known.add(row.id)
  if(has(destination,'lcm_nodes'))for(const row of destination.prepare('SELECT DISTINCT session_id AS id FROM lcm_nodes').all())known.add(row.id)
 }finally{destination.close()}
 if(!known.size)return result
 const old=new DatabaseSync(source,{readOnly:true});old.exec('BEGIN')
 try{
  for(const session of known){
   const nodes=has(old,'lcm_nodes')?old.prepare('SELECT * FROM lcm_nodes WHERE session_id=?').all(session).map(rowToNode):[]
   const draft=has(old,'lcm_compaction_drafts')?old.prepare("SELECT fingerprint,data_json AS data,status FROM lcm_compaction_drafts WHERE session_id=? AND status='ready'").get(session):null
   const priorDraft=target.draftRecord(session)
   if(draft&&priorDraft&&!isDeepStrictEqual({...draft},priorDraft)){result.conflicts++;continue}
   if(nodes.some(node=>{const prior=target.getNode(session,node.nodeId);return prior&&!isDeepStrictEqual(prior,node)})){
    result.conflicts++;continue
   }
   for(const node of nodes){const saved=target.insertNodeIfMissing(node);if(saved.inserted)result.recovered++;else if(!isDeepStrictEqual(saved.node,node))result.conflicts++}
   if(draft&&!priorDraft){if(target.saveDraftIfMissing(session,draft.fingerprint,draft.data))result.drafts++;else if(!isDeepStrictEqual(target.draftRecord(session),{...draft}))result.conflicts++}
   if(has(old,'lcm_summary_blocks'))for(const row of old.prepare('SELECT fingerprint FROM lcm_summary_blocks WHERE session_id=?').all(session))target.blockSummary(session,row.fingerprint)
  }
 }finally{old.exec('ROLLBACK');old.close()}
 return result
}
