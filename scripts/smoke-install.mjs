// Exercise the official installer and real host in an isolated user home.
// Run through npm so npm_execpath is a portable JavaScript launcher on Windows.
// The test loader supplies peers only for the fixture writer in this process.
// Spawned DSH hosts load their installed packages directly, without that loader.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {tmpdir,homedir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import {SuperLcmStore} from '../src/store.js'
import {ArchiveDatabase} from '../src/archive-db.js'
const root=fileURLToPath(new URL('../',import.meta.url)),meta=JSON.parse(readFileSync(join(root,'package.json')))
const local=join(root,'node_modules','@deepseek-ai','dsh','package.json')
const anchor=process.env.SUPERLCM_DSH_RUNTIME||(existsSync(local)?local:join(homedir(),'.npm-global','lib','node_modules','@deepseek-ai','dsh','package.json'))
const host=createRequire(anchor),hostMeta=host.resolve('@deepseek-ai/dsh/package.json'),cli=join(dirname(hostMeta),JSON.parse(readFileSync(hostMeta)).bin.dsh)
assert.ok(process.env.npm_execpath,'Run with npm run test:install')
const home=mkdtempSync(join(tmpdir(),'SuperLcm 用户 空格 # % ')),database=join(home,'用户档案.sqlite')
const env={...process.env,DSH_HOME:home,DSH_SUPERLCM_DB:database,DSH_LOSSLESS_DB:''}
const run=(bin,args,cwd=root)=>{
 const result=spawnSync(process.execPath,[bin,...args],{cwd,env,encoding:'utf8',timeout:60000})
 assert.equal(result.status,0,`${result.error?.message||''}\n${result.stderr}\n${result.stdout}`)
 return result.stdout
}
const pack=dir=>{const output=JSON.parse(run(process.env.npm_execpath,['pack','--json'],dir));return join(dir,output[0].filename)}
const baseline=join(home,'旧版包');mkdirSync(baseline)
const ref='ef95cdaf37fbf8819e20f3004c15c3823b4ae98d'
const list=spawnSync('git',['ls-tree','-r','--name-only',ref],{cwd:root,encoding:'utf8'});assert.equal(list.status,0,list.stderr)
for(const path of list.stdout.trim().split('\n').filter(p=>/^(?:src\/|lib\/|docs\/|examples\/|README|LICENSE|THIRD_PARTY|cordis\.patch|CHANGELOG|package\.json$)/.test(p))){
 const file=join(baseline,path);mkdirSync(dirname(file),{recursive:true})
 const data=spawnSync('git',['show',`${ref}:${path}`],{cwd:root,maxBuffer:8*1024*1024});assert.equal(data.status,0,String(data.stderr));writeFileSync(file,data.stdout)
}
const install=archive=>run(cli,['plugin','--profile','web','add',archive,'--offline'])
const redact=text=>text.replace(/([?&]token=)[^\s]+/g,'$1[hidden]')
async function start(){
 const child=spawn(process.execPath,[cli,'web','--host','127.0.0.1','--port','0','--no-open'],{cwd:root,env,stdio:['ignore','pipe','pipe']})
 let log='',finished=false
 const ended=once(child,'exit').then(()=>{finished=true})
 let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
 const consume=data=>{log=(log+data.toString()).slice(-128000);const match=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);if(match)resolveReady(match[1])}
 child.stdout.on('data',consume);child.stderr.on('data',consume)
 child.once('error',rejectReady);child.once('exit',()=>rejectReady(Error(redact(log))))
 const timer=setTimeout(()=>rejectReady(Error('Host did not start: '+redact(log))),30000)
 const stop=async()=>{clearTimeout(timer);if(!finished){child.kill('SIGTERM');await ended}}
 try{
  const login=await ready;clearTimeout(timer)
  const response=await fetch(login,{redirect:'manual'}),cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie)
  const origin=new URL(login).origin
  const rpc=async(method,payload=null)=>{const response=await fetch(origin+'/api/dsh-superlcm/'+method,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method:'dsh-superlcm/'+method,payload})});assert.equal(response.status,200);const result=(await response.json()).result;assert.equal(result.ok,true,JSON.stringify(result));return result.value}
  return {rpc,stop,log:()=>redact(log)}
 }catch(error){await stop();throw error}
}
install(pack(baseline))
let app=await start(),before
try{
 before=await app.rpc('read');assert.equal(before.version,'0.5.21');assert.equal(before.runtime.mode,'native')
 await app.rpc('save',{revision:before.revision,settings:{...before.settings,chunkTokens:32000,compressionRatio:.85}})
}finally{await app.stop()}
const originals=new ArchiveDatabase(database);originals.capture({id:'upgrade-source'},Array.from({length:6},(_,seq)=>({seq,time:1,type:'user/message',data:{content:'Prior original '+seq}})));originals.close()
// Seed the prior release's misplaced index location, not the fixed destination.
const native=new SuperLcmStore(join(home,'lcm.sqlite'));native.upsertNode({sessionId:'upgrade-source',nodeId:'legacy',createdAt:1,summaryText:'Exact prior user decision',sourceSeqs:[3,5],status:'ready'});native.close()
install(pack(root))
app=await start()
try{
 const after=await app.rpc('read');assert.equal(after.version,meta.version);assert.equal(after.runtime.mode,'native')
 assert.equal(after.settings.chunkTokens,32000);assert.equal(after.settings.compressionRatio,.85);assert.deepEqual(after.catalog,before.catalog)
 const recalled=await app.rpc('outline',{session:'upgrade-source'});assert.ok(recalled.nodes.some(node=>node.summary==='Exact prior user decision'));assert.equal(recalled.total,6)
 const originals=await app.rpc('read-events',{session:'upgrade-source'});assert.equal(originals.items.length,6);assert.ok(originals.items[3].text.includes('Prior original 3'))
 const restored=new SuperLcmStore(database);assert.equal(restored.getNode('upgrade-source','legacy').summaryText,'Exact prior user decision');restored.close()
 const manifest=JSON.parse(readFileSync(join(home,'profiles','web','package.json')));assert.equal(manifest.dsh.profile.bundles.filter(p=>p==='SuperLcm').length,1)
 assert.ok(!app.log().includes('failed to load'))
 console.log(JSON.stringify({platform:process.platform,from:'0.5.21',to:meta.version,officialInstall:true,realHost:true,specialCharacterHome:true,settingsPreserved:true,archivePreserved:true,modelCatalogPreserved:true,nativeCompaction:true}))
}finally{await app.stop()}
