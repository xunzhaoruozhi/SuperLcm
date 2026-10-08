import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {importSharedDshArchive} from '../src/shared-archive-import.js'
import {ArchiveDatabase} from '../src/archive-db.js'
import {SuperLcmStore} from '../src/store.js'
test('shared migration preserves DSH originals and summary lineage without importing other harnesses',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sl-shared-')),source=join(dir,'shared.sqlite'),destination=join(dir,'dsh.sqlite'),raw=join(dir,'one.jsonl'),db=new DatabaseSync(source)
 const header={id:'one',createdAt:1},events=[{seq:0,type:'user/message',data:{content:'Exact first original'}},{seq:1,type:'user/message',data:{content:'Exact second original'}}]
 writeFileSync(raw,events.map(event=>JSON.stringify({dsh_session:'one',event})).join('\n')+'\n')
 db.exec('CREATE TABLE dsh_mirrors(session TEXT,header TEXT,next_seq INTEGER,bytes INTEGER);CREATE TABLE sources(session TEXT,path TEXT);CREATE TABLE nodes(session TEXT,id TEXT,level INTEGER,first INTEGER,last INTEGER,children TEXT,summary TEXT,model TEXT);')
 db.prepare('INSERT INTO dsh_mirrors VALUES(?,?,?,?)').run('mirror',JSON.stringify(header),2,statSync(raw).size);db.prepare('INSERT INTO sources VALUES(?,?)').run('mirror',raw)
 db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').run('mirror','a',0,0,0,'[]','First preserved summary','model')
 db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').run('mirror','b',0,1,1,'[]','Second preserved summary','model')
 db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').run('mirror','p',1,0,1,'["a","b"]','Parent preserved summary','model')
 db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').run('claude','other',0,0,9,'[]','Unrelated original','model');db.close()
 const result=await importSharedDshArchive(source,destination);assert.equal(result.events,2);assert.equal(result.archiveNodes,3)
 const archive=new ArchiveDatabase(destination);assert.equal(archive.sessions().items.length,1);assert.deepEqual(archive.nodes('one').find(n=>n.id==='legacy:p').children,['legacy:a','legacy:b']);assert.deepEqual(archive.nodes('one').find(n=>n.id==='legacy:p').sources,[0,1]);archive.close()
 assert.equal((await importSharedDshArchive(source,destination)).archiveNodes,3)
})

function nativeFixture(){
 const dir=mkdtempSync(join(tmpdir(),'sl-conflict-')),source=join(dir,'shared.sqlite'),destination=join(dir,'dsh.sqlite'),raw=join(dir,'one.jsonl'),db=new DatabaseSync(source)
 const header={id:'one',createdAt:1},events=[0,1].map(seq=>({seq,type:'user/message',data:{content:'Original '+seq}}))
 writeFileSync(raw,events.map(event=>JSON.stringify({dsh_session:'one',event})).join('\n')+'\n')
 db.exec('CREATE TABLE dsh_mirrors(session TEXT,header TEXT,next_seq INTEGER,bytes INTEGER);CREATE TABLE sources(session TEXT,path TEXT);CREATE TABLE nodes(session TEXT,id TEXT,level INTEGER,first INTEGER,last INTEGER,children TEXT,summary TEXT,model TEXT);')
 db.prepare('INSERT INTO dsh_mirrors VALUES(?,?,?,?)').run('mirror',JSON.stringify(header),2,statSync(raw).size);db.prepare('INSERT INTO sources VALUES(?,?)').run('mirror',raw);db.close()
 const native=new SuperLcmStore(source)
 native.upsertNode({sessionId:'one',nodeId:'n',compactionId:'c',summarySeq:2,createdAt:1,summary:[{type:'text',text:'Same summary'}],summaryText:'Same summary',sourceSeqs:[0],childIds:[],status:'ready',kind:'leaf'});native.close()
 return {source,destination}
}
test('migration rejects same native summary text with changed sources or children and preserves target',async()=>{
 for(const change of [{sourceSeqs:[1]},{childIds:['repaired-child']}]){
  const {source,destination}=nativeFixture();await importSharedDshArchive(source,destination)
  const native=new SuperLcmStore(destination),before={...native.getNode('one','n'),...change};native.upsertNode(before);const saved=native.getNode('one','n');native.close()
  await assert.rejects(importSharedDshArchive(source,destination),/引用冲突/)
  const after=new SuperLcmStore(destination);assert.deepEqual(after.getNode('one','n'),saved);after.close()
 }
})
test('migration rejects same archive summary text with changed references and preserves target',async()=>{
 const {source,destination}=nativeFixture(),sourceDb=new DatabaseSync(source)
 sourceDb.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)').run('mirror','a',0,0,0,'[]','Same summary','model');sourceDb.close()
 await importSharedDshArchive(source,destination)
 const target=new ArchiveDatabase(destination);target.db.prepare('UPDATE sl_nodes SET sources=? WHERE session=? AND id=?').run('[1]','one','legacy:a');target.close()
 await assert.rejects(importSharedDshArchive(source,destination),/引用冲突/)
 const after=new ArchiveDatabase(destination);assert.deepEqual(after.nodes('one')[0].sources,[1]);after.close()
})
test('identical native nodes migrate repeatedly without changing their metadata or references',async()=>{
 const {source,destination}=nativeFixture();await importSharedDshArchive(source,destination)
 const native=new SuperLcmStore(destination),before=native.getNode('one','n');native.close()
 assert.equal((await importSharedDshArchive(source,destination)).nativeNodes,1)
 const after=new SuperLcmStore(destination);assert.deepEqual(after.getNode('one','n'),before);after.close()
})

test('upgrade recovers misplaced compaction nodes only for known sessions without overwriting or moving files',async()=>{
 const {recoverMisplacedNodes}=await import('../src/upgrade-store.js')
 const dir=mkdtempSync(join(tmpdir(),'sl-sidecar-')),path=join(dir,'custom.sqlite'),old=new SuperLcmStore(join(dir,'lcm.sqlite')),target=new SuperLcmStore(path),archive=new ArchiveDatabase(path)
 archive.capture({id:'known'},[{seq:0,time:1,type:'user/message',data:{content:'Retained original'}}]);archive.close()
 old.upsertNode({sessionId:'known',nodeId:'draft',createdAt:1,summaryText:'Prepared facts',sourceSeqs:[0],status:'ready'})
 old.saveDraft('known','input-fingerprint',JSON.stringify({checkpoint:'Prepared state'}))
 old.blockSummary('known','rejected-input')
 old.upsertNode({sessionId:'other',nodeId:'other',createdAt:1,summaryText:'Other database facts',sourceSeqs:[0],status:'ready'})
 old.close()
 const recovered=recoverMisplacedNodes(target);assert.equal(recovered.recovered,1);assert.equal(recovered.drafts,1);assert.equal(target.loadDraft('known').fingerprint,'input-fingerprint');assert.equal(target.summaryBlocked('known','rejected-input'),true);assert.equal(target.getNode('known','draft').summaryText,'Prepared facts');assert.equal(target.getNode('other','other'),null)
 assert.equal(recoverMisplacedNodes(target).recovered,0)
 target.finishDraft('known','committed');assert.equal(recoverMisplacedNodes(target).conflicts,1);assert.equal(target.loadDraft('known'),null)
 target.upsertNode({...target.getNode('known','draft'),summaryText:'Corrected chosen facts'})
 assert.equal(recoverMisplacedNodes(target).conflicts,1);assert.equal(target.getNode('known','draft').summaryText,'Corrected chosen facts')
 target.close();const preserved=new SuperLcmStore(join(dir,'lcm.sqlite'));assert.equal(preserved.getNode('known','draft').summaryText,'Prepared facts');preserved.close()
})

test('upgrade recovery cannot overwrite a node or draft concurrently written by another host',async()=>{
 const {recoverMisplacedNodes}=await import('../src/upgrade-store.js')
 const dir=mkdtempSync(join(tmpdir(),'sl-upgrade-race-')),path=join(dir,'custom.sqlite'),old=new SuperLcmStore(join(dir,'lcm.sqlite')),target=new SuperLcmStore(path),writer=new SuperLcmStore(path),archive=new ArchiveDatabase(path)
 archive.capture({id:'known'},[{seq:0,time:1,type:'user/message',data:{content:'Original'}}]);archive.close()
 const prior={sessionId:'known',nodeId:'race',createdAt:1,summaryText:'Old facts',sourceSeqs:[0],status:'ready'}
 old.upsertNode(prior);old.saveDraft('known','old','old prepared state');old.close()
 const insert=target.insertNodeIfMissing.bind(target),draft=target.saveDraftIfMissing.bind(target)
 target.insertNodeIfMissing=node=>{writer.upsertNode({...prior,summaryText:'New chosen facts'});return insert(node)}
 target.saveDraftIfMissing=(...args)=>{writer.saveDraft('known','new','new prepared state');return draft(...args)}
 const result=recoverMisplacedNodes(target);assert.equal(result.recovered,0);assert.equal(result.drafts,0);assert.equal(result.conflicts,2)
 assert.equal(target.getNode('known','race').summaryText,'New chosen facts');assert.equal(target.loadDraft('known').fingerprint,'new')
 writer.close();target.close()
})
