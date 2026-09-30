import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2]

if (!modulePath) {
  console.error('FAIL — module path is required')
  process.exit(2)
}

const plugin = await import(pathToFileURL(resolve(modulePath)).href)

if (typeof plugin.apply !== 'function') {
  console.error('FAIL — DSH plugin must export a named apply function')
  process.exit(1)
}

if (Object.hasOwn(plugin, 'default')) {
  console.error('FAIL — default export makes the loader instantiate WebfreeAdapter as a plugin')
  process.exit(1)
}

console.log('OK — DSH plugin export contract passed')
