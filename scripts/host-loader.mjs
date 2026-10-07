// Verification only: resolve optional DSH peers from an existing host install.
// Production profiles already resolve these packages through their node_modules.
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const local=fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/package.json',import.meta.url))
const runtime = process.env.SUPERLCM_DSH_RUNTIME || (existsSync(local)?local:join(homedir(), '.npm-global/lib/node_modules/@deepseek-ai/dsh/package.json'))
const host = createRequire(runtime)
export async function resolve(specifier, context, nextResolve) {
  // One physical host dependency tree avoids mixing Cordis/session identities.
  if (specifier.startsWith('@deepseek-ai/')) {
    return {url:pathToFileURL(host.resolve(specifier)).href,shortCircuit:true}
  }
  return nextResolve(specifier,context)
}
