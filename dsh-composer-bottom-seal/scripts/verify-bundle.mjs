import { existsSync, readFileSync } from 'node:fs'
if (!existsSync(new URL('../lib/index.js', import.meta.url))) throw new Error('host bundle missing lib/index.js')
const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
if (!code.startsWith('window.__ModuleLoader__.load({')) throw new Error('client bundle lacks ModuleLoader wrapper')
if (!code.includes('id: "dsh-composer-bottom-seal"')) throw new Error('client bundle id mismatch')
console.log('bundle-wrapper-ok')
