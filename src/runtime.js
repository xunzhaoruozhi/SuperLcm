import Basic from '@deepseek-ai/dsh-compaction-basic'
import {mkdirSync,writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {SuperLcmStore,resolveDatabasePath} from './store.js'
import {mountCompactionOwner} from './compaction-owner.js'
import {apply as tools} from './tool.js'
import {ArchiveService} from './archive-service.js'
import {pluginApi} from './plugin-api.js'
import {settingsPath,readSettings} from './settings.js'
export const name='SuperLcm'
export const inject=['sessions','sessionQuery','llm','tools','tokenMeter']
export const Config=Basic.Config
export async function apply(ctx,config={}) {
  const native=new SuperLcmStore(resolveDatabasePath()),file=settingsPath()
  ctx.effect(()=>()=>native.close())
  const doc=readSettings(file)
  if(doc.revision==='initial'){mkdirSync(dirname(file),{recursive:true,mode:0o700});try{writeFileSync(file,JSON.stringify(doc,null,2)+'\n',{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error}}
  const profile=ctx.get?.('profileContext')?.name
  const entry=ctx.fiber?.entry
  const nativeRow=[...(ctx.loader?.entries?.()||[])].find(row=>row.options?.id==='compaction-basic'&&row.parent===entry?.parent&&row.options?.name==='@deepseek-ai/dsh-compaction-basic')
  const nativeConfig=Basic.Config(nativeRow?.options?.config||config)
  const owner=await mountCompactionOwner(ctx,{...config,archiveHome:dirname(native.path),controlFile:file,nativeConfigs:{[profile]:nativeConfig}})
  tools(ctx,{store:native})
  const archive=new ArchiveService(ctx,native,file)
  const api=pluginApi(ctx,archive,owner,file)
  ctx.effect(()=>()=>archive.close())
  // Cold histories are archived on mount too; paid summaries wait for a turn
  // completion or an explicit UI request and their separate enable switch.
  void archive.import()
}
