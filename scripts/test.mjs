// Compatibility entry; the standalone suite uses actual installed DSH peers.
import {spawn} from 'node:child_process'
const child=spawn(process.execPath,['--experimental-loader',new URL('./host-loader.mjs',import.meta.url).pathname,'--test',...['standalone.test.js','standalone-owner.test.js','standalone-tree.test.js','standalone-service.test.js','standalone-settings.test.js','standalone-ui.test.js'].map(x=>new URL('../test/'+x,import.meta.url).pathname)],{stdio:'inherit'})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
