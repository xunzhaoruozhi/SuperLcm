import test from 'node:test'
import assert from 'node:assert/strict'
import {readRawDshSession} from '../src/raw-session.js'
test('cold incremental capture reads only persisted tail events and never synthesizes closers',async()=>{
 let opened=0,closed=0,readFrom
 const ctx={sessionPersistence:{async open(){opened++;return {header:{id:'one'},inheritedEventCount:0,async read(from){readFrom=from;return {events:[{seq:10,type:'user/message'}]}},close(){closed++}}}},sessionQuery:{observeSession(){throw Error('synthetic query must not be used')}}}
 const raw=await readRawDshSession(ctx,'one',10);assert.equal(readFrom,10);assert.equal(raw.events[0].seq,10);await raw.close();assert.equal(opened,1);assert.equal(closed,1)
})
