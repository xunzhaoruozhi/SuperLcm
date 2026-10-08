import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,existsSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import {apply} from '../src/runtime.js'
import Engine from '../src/engine.js'
import {SuperLcmStore,resolveDatabasePath,resolveConfiguredDatabasePath} from '../src/store.js'
import {defaults,saveSettings,readSettings,settingsPath} from '../src/settings.js'

test('all runtime stores retain a custom filename across native and takeover modes in a non-ASCII home',async()=>{
 const home=mkdtempSync(join(tmpdir(),'用户 空格 # % ')),path=join(home,'自定义 归档.sqlite'),ctx=new Context(),saved={}
 for(const key of ['DSH_HOME','DSH_SUPERLCM_DB','DSH_LOSSLESS_DB'])saved[key]=process.env[key]
 process.env.DSH_HOME=home;process.env.DSH_SUPERLCM_DB=path;delete process.env.DSH_LOSSLESS_DB
 try{
  const priorArchive=new SuperLcmStore(path);priorArchive.upsertNode({sessionId:'old',nodeId:'existing',createdAt:1,summaryText:'Retained',status:'ready'});priorArchive.close()
  writeFileSync(join(home,'lcm.sqlite'),'Unrelated broken legacy file')
  new SessionStore(ctx);new Projections(ctx);new TokenMeter(ctx)
  ctx.reflect.provide('tools',{register(){}})
  ctx.reflect.provide('llm',{listProviders:async()=>[],listModels:async()=>[],stream:async function*(){throw Error('No real model calls')},resolveModelInfo:async()=>({context:{contextWindow:262144},defaultMaxTokens:65536})})
  ctx.reflect.provide('sessionQuery',{listSessions:async()=>[]})
  await apply(ctx)
  assert.equal(resolveDatabasePath(),path);assert.equal(settingsPath(),join(home,'settings.json'))
  assert.ok(existsSync(path));assert.equal(readFileSync(join(home,'lcm.sqlite'),'utf8'),'Unrelated broken legacy file')
  const doc=readSettings(),next=saveSettings({revision:doc.revision,settings:{...defaults,takeover:true,compactionProvider:'test',compactionModel:'model'}},[{id:'test',models:[{id:'model'}]}])
  await ctx.waterfall('agent/pre-step',{agent:{session:ctx.sessions.create('probe'),runMaintenance:async()=>{},options:{provider:'test',model:'model'}},signal:new AbortController().signal},()=>{})
  assert.ok(ctx.compaction instanceof Engine);assert.equal(ctx.compaction.superLcmStore.path,path)
  ctx.compaction.superLcmStore.upsertNode({sessionId:'probe',nodeId:'shared',createdAt:1,summaryText:'Verifiable shared state',sourceSeqs:[1],status:'ready'})
  const other=new SuperLcmStore(path);assert.equal(other.getNode('probe','shared').summaryText,'Verifiable shared state');other.close()
  saveSettings({revision:next.revision,settings:defaults},[])
  await ctx.waterfall('agent/pre-step',{agent:{session:ctx.sessions.get('probe'),runMaintenance:async()=>{},options:{provider:'test',model:'model'}},signal:new AbortController().signal},()=>{})
  assert.ok(!(ctx.compaction instanceof Engine));assert.equal(readFileSync(join(home,'lcm.sqlite'),'utf8'),'Unrelated broken legacy file')
 }finally{
  await ctx.fiber.dispose()
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value
 }
})
test('database resolution follows the selected user home and legacy files without global paths',()=>{
 const home=mkdtempSync(join(tmpdir(),'standalone-paths-'))
 assert.equal(resolveDatabasePath({DSH_HOME:home}),join(home,'SuperLcm','lcm.sqlite'))
 const path=join(home,'chosen.sqlite');assert.equal(resolveDatabasePath({DSH_HOME:home,DSH_SUPERLCM_DB:path}),path)
 assert.equal(resolveDatabasePath({DSH_HOME:home,DSH_LOSSLESS_DB:path}),path)
 assert.equal(resolveConfiguredDatabasePath({databasePath:path,archiveHome:dirname(path)}),path)
 assert.equal(resolveConfiguredDatabasePath({archiveHome:home}),resolve(home,'lcm.sqlite'))
 const explicit=new SuperLcmStore(join(home,'lossless-context','lcm.sqlite'));explicit.close()
 assert.equal(resolveDatabasePath({DSH_HOME:home}),join(home,'lossless-context','lcm.sqlite'))
})
