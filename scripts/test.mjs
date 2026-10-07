// Compatibility entry; the standalone suite uses actual installed DSH peers.
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const child=spawn(process.execPath,['--experimental-loader',new URL('./host-loader.mjs',import.meta.url).href,'--test',...['standalone.test.js','standalone-owner.test.js','standalone-tree.test.js','standalone-service.test.js','standalone-settings.test.js','standalone-ui.test.js'].map(x=>fileURLToPath(new URL('../test/'+x,import.meta.url)))],{stdio:'inherit'})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
