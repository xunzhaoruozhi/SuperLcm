import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {ArchiveService} from '../src/archive-service.js'
import {SuperLcmStore} from '../src/store.js'
import {defaults,settingsDocument} from '../src/settings.js'
const tick=()=>new Promise(r=>setImmediate(r))
async function fixture(run,enabled=true,respond=async()=> 'Source facts with exact references'){
 const dir=mkdtempSync(join(tmpdir(),'standalone-service-')),file=join(dir,'settings.json'),native=new SuperLcmStore(join(dir,'lcm.sqlite')),ctx=new Context(),calls=[],tools=[]
 const doc=settingsDocument({...defaults,summaryEnabled:enabled,summaryProvider:'local',summaryModel:'summary',chunkTokens:1000},'one');writeFileSync(file,JSON.stringify(doc))
 new SessionStore(ctx);new SessionProjections(ctx)
 ctx.reflect.provide('tools',{register:tool=>tools.push(tool)})
 ctx.reflect.provide('llm',{async *stream(options){calls.push(options);const text=await respond(options);yield {type:'text-delta',index:0,text};yield {type:'finish',reason:{kind:'stop'}}}})
 ctx.reflect.provide('sessionQuery',{observeSession:async id=>{const s=ctx.sessions.get(id);return {source:'live',header:s.header,events:s.snapshotEvents(),[Symbol.dispose](){}}},listSessions:async()=>[]})
 const archive=new ArchiveService(ctx,native,file),session=ctx.sessions.create('standalone-service',{meta:{cwd:'/project'}})
 const append=text=>session.append('user/message',createUserMessage({content:[{type:'text',text}]}),{surfaceOp:'append'})
 try{await run({ctx,session,archive,append,file,doc,calls,tools,native})}finally{await ctx.fiber.dispose();await archive.close();native.close()}
}
test('archive-only summaries use the selected host model and never replace the conversation',async()=>{
 await fixture(async({session,archive,append,calls,tools})=>{
  append('Original source facts '.repeat(500));append('Next original source facts '.repeat(500));append('Recent tail')
  const surface=[...session.surface.nodes];archive.schedule(session.id);await archive.drain()
  assert.ok(calls.length);assert.equal(calls[0].provider,'local');assert.equal(calls[0].model,'summary');assert.notEqual(calls[0].sessionId,session.id)
  assert.deepEqual(session.surface.nodes,surface);assert.equal(session.snapshotEvents().some(e=>e.type==='compaction/summary'),false)
  assert.ok(archive.outline(session.id).nodes.length);assert.ok(tools.some(t=>t.name==='lcm_read'))
 })
})
test('paid archive summaries stop on disable and late model output is discarded',async()=>{
 let finish,started;const begun=new Promise(r=>started=r),answer=new Promise(r=>finish=r)
 await fixture(async({session,archive,append,file,doc,calls})=>{
  append('Original source facts '.repeat(500));append('Next original source facts '.repeat(500))
  archive.schedule(session.id);await begun
  writeFileSync(file,JSON.stringify(settingsDocument({...doc.settings,summaryEnabled:false},'two')));archive.changed();finish('Late summary facts');await archive.drain()
  assert.equal(calls.length,1);assert.equal(archive.db.nodes(session.id).length,0)
  assert.ok(archive.db.events(session.id).items.length)
 },true,async()=>{started();return answer})
})
test('history archiving and native mode make no auxiliary model calls when summaries are off',async()=>{
 await fixture(async({session,archive,append,calls})=>{
  append('Long original source '.repeat(2000));await archive.drain();await archive.import();await archive.drain()
  assert.equal(calls.length,0);assert.ok(archive.db.events(session.id).items.length);assert.throws(()=>archive.schedule(session.id),/开启/)
 },false)
})

test('native committed checkpoints appear at the real summary depth without assembly wrappers',async()=>{
 await fixture(async({session,archive,append,native})=>{
  append('First exact source');append('Second exact source');await archive.drain()
  const seqs=session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>e.seq)
  const a=[{type:'text',text:'Summary A'}],b=[{type:'text',text:'Summary B'}]
  native.upsertNode({sessionId:session.id,nodeId:'a',summary:a,summaryText:'Summary A',sourceSeqs:[seqs[0]],status:'ready',kind:'leaf'})
  native.upsertNode({sessionId:session.id,nodeId:'b',summary:b,summaryText:'Summary B',sourceSeqs:[seqs[1]],status:'ready',kind:'leaf'})
  native.upsertNode({sessionId:session.id,nodeId:'wrapper',summary:[...a,...b],summaryText:'Summary A Summary B',childIds:['a','b'],sourceSeqs:seqs,status:'ready',kind:'assembled'})
  const outline=archive.outline(session.id);assert.equal(outline.nodes.length,2);assert.ok(outline.nodes.every(n=>n.level===0));assert.equal(outline.uncovered,0);assert.equal(archive.sessions().items[0].summaryCount,2)
 },false)
})
