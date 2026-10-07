import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readSettings,settingsDocument,defaults} from '../src/settings.js'
test('two independent DSH hosts cannot silently overwrite the same revision',async()=>{
 const file=join(mkdtempSync(join(tmpdir(),'sl-lock-')),'settings.json');writeFileSync(file,JSON.stringify(settingsDocument(defaults,'shared')))
 const source=`import {saveSettings,defaults} from ${JSON.stringify(new URL('../src/settings.js',import.meta.url).href)};import {once} from 'node:events';process.send({ready:true});await once(process,'message');try{saveSettings({revision:'shared',settings:{...defaults,compressionRatio:Number(process.argv[2])}},[],process.argv[1]);process.send({saved:true})}catch(e){process.send({error:e.message})}process.disconnect()`
 const children=[.7,.9].map(r=>spawn(process.execPath,['--experimental-loader',new URL('../scripts/host-loader.mjs',import.meta.url).pathname,'--input-type=module','-e',source,file,String(r)],{stdio:['ignore','ignore','pipe','ipc']}))
 const ready=children.map(child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('message',resolve)}))
 await Promise.all(ready)
 const results=children.map(child=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('message',resolve);child.send('go')}))
 const values=await Promise.all(results);assert.equal(values.filter(v=>v.saved).length,1);assert.match(values.find(v=>v.error).error,/变化/)
 await Promise.all(children.map(c=>c.exitCode===null?new Promise(r=>c.once('exit',r)):Promise.resolve()))
 assert.ok([.7,.9].includes(readSettings(file).settings.compressionRatio))
})
