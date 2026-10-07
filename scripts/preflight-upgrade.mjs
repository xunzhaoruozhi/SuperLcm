#!/usr/bin/env node
// Verify the standalone suite against a separately installed host. This entry
// does not install packages or change a live DSH profile.
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
if(!process.env.SUPERLCM_DSH_RUNTIME){
 console.error('Set SUPERLCM_DSH_RUNTIME to the candidate DSH package.json path, then run this script. The candidate must already be installed in a separate directory.')
 process.exitCode=2
}else{
 const child=spawn(process.execPath,[fileURLToPath(new URL('./test.mjs',import.meta.url))],{stdio:'inherit',env:process.env})
 child.on('error',error=>{console.error(error.message);process.exitCode=2})
 child.on('exit',code=>{process.exitCode=code??2})
}
