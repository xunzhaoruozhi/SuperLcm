// Explicit one-time migration from the shared SuperLcm archive. Reads only DSH
// mirrors; the source database and original files remain untouched.
import {DatabaseSync} from 'node:sqlite'
import {isDeepStrictEqual} from 'node:util'
import {createReadStream} from 'node:fs'
import {createInterface} from 'node:readline'
import {ArchiveDatabase,sessionId} from './archive-db.js'
import {SuperLcmStore} from './store.js'
const has=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
export async function importSharedDshArchive(source,destination) {
 const old=new DatabaseSync(source,{readOnly:true}),native=new SuperLcmStore(destination),archive=new ArchiveDatabase(destination)
 old.exec('BEGIN')
 const result={sessions:0,events:0,nativeNodes:0,archiveNodes:0}
 try{
  if(!has(old,'dsh_mirrors'))return result
  for(const mirror of old.prepare('SELECT session,header,next_seq,bytes FROM dsh_mirrors').all()){
   const header=JSON.parse(mirror.header),id=sessionId(header.id),metadata=old.prepare('SELECT path FROM sources WHERE session=?').get(mirror.session)
   if(!metadata)throw Error('旧 DSH 归档缺少原文路径')
   const stream=createReadStream(metadata.path,mirror.bytes?{end:mirror.bytes-1}:{}),lines=createInterface({input:stream,crlfDelay:Infinity})
   let batch=[],count=0
   try{for await(const line of lines){if(!line.trim())continue;const record=JSON.parse(line)
    if(record.dsh_session!==id||!record.event)throw Error('旧 DSH 原文身份不一致')
    batch.push(record.event);count++
    if(batch.length===500){archive.capture(header,batch);batch=[];await new Promise(r=>setImmediate(r))}
   }}finally{lines.close();stream.destroy()}
   if(batch.length)archive.capture(header,batch)
   if(count!==mirror.next_seq||archive.cursor(id)!==mirror.next_seq)throw Error('旧 DSH 归档存在缺失，拒绝迁移摘要')
   if(!count)archive.capture(header,[])
   result.sessions++;result.events+=count
   if(has(old,'lcm_nodes'))for(const row of old.prepare("SELECT * FROM lcm_nodes WHERE session_id=? AND status='ready'").all(id)){
    const sourceSeqs=[...new Set(JSON.parse(row.source_seqs_json))],incoming={sessionId:id,nodeId:row.node_id,compactionId:row.compaction_id??null,summarySeq:row.summary_seq??null,createdAt:row.created_at,summary:JSON.parse(row.summary_json),summaryText:row.summary_text,childIds:[...new Set(JSON.parse(row.child_ids_json))],sourceSeqs,sourceStart:sourceSeqs[0]??null,sourceEnd:sourceSeqs.at(-1)??null,shadowedTokenCount:row.shadowed_token_count??null,provider:row.provider??null,model:row.model??null,status:row.status,kind:row.node_kind??null}
    const prior=native.getNode(id,row.node_id)
    if(prior&&!isDeepStrictEqual(prior,incoming))throw Error('旧摘要和目标摘要内容或引用冲突')
    if(!prior)native.upsertNode(incoming)
    result.nativeNodes++
   }
   const nodes=old.prepare('SELECT * FROM nodes WHERE session=?').all(mirror.session).filter(n=>!n.model.startsWith('dsh-native:'))
   const byId=new Map(nodes.map(n=>[n.id,n])),memo=new Map(),original=archive.sourceRows(id)
   const revisions=new Map(has(old,'dsh_record_revisions')?old.prepare('SELECT seq,replaced_by FROM dsh_record_revisions WHERE session=?').all(mirror.session).map(r=>[r.seq,r.replaced_by]):[])
   const categories=new Map(has(old,'dsh_record_kinds')?old.prepare('SELECT seq,category FROM dsh_record_kinds WHERE session=?').all(mirror.session).map(r=>[r.seq,r.category]):[])
   const sources=(key,seen=new Set())=>{
    if(seen.has(key))throw Error('旧摘要树存在循环');if(memo.has(key))return memo.get(key)
    const node=byId.get(key);if(!node)throw Error('旧摘要树缺少子节点')
    const children=JSON.parse(node.children),seqs=children.length?[...new Set(children.flatMap(child=>sources(child,new Set([...seen,key]))))]:original.filter(r=>r.seq>=node.first&&r.seq<=node.last&&(!categories.size||categories.get(r.seq)==='original')&&!(revisions.get(r.seq)<=node.last)).map(r=>r.seq)
    memo.set(key,seqs);return seqs
   }
   for(const node of nodes){const nodeId='legacy:'+node.id,seqs=sources(node.id),prior=archive.db.prepare('SELECT * FROM sl_nodes WHERE session=? AND id=?').get(id,nodeId)
    if(!seqs.length)throw Error('旧归档摘要缺少可验证原文来源')
    const incoming={session:id,id:nodeId,level:node.level,first:seqs[0],last:seqs.at(-1),summary:node.summary,children:JSON.parse(node.children).map(x=>'legacy:'+x),sources:seqs,createdAt:header.createdAt??0}
    if(prior&&!isDeepStrictEqual({...prior,children:JSON.parse(prior.children),sources:JSON.parse(prior.sources)},incoming))throw Error('旧归档摘要和目标摘要内容或引用冲突')
    if(!prior)archive.db.prepare('INSERT INTO sl_nodes VALUES(?,?,?,?,?,?,?,?,?)').run(id,nodeId,node.level,seqs[0],seqs.at(-1),node.summary,JSON.stringify(incoming.children),JSON.stringify(seqs),incoming.createdAt)
    result.archiveNodes++
   }
  }
  return result
 }finally{archive.close();native.close();old.exec('ROLLBACK');old.close()}
}
