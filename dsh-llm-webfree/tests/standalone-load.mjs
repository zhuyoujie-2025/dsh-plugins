// standalone plugin loading test — exercise cordis directly without dsh
import * as plugin from '../lib/index.js'

console.log('plugin keys:', Object.keys(plugin))
console.log('plugin.apply:', typeof plugin.apply)
console.log('plugin.name:', plugin.name)
console.log('plugin.inject:', plugin.inject)
console.log('plugin.WebfreeAdapter:', typeof plugin.WebfreeAdapter)

// Manually invoke apply with a fake ctx to verify the inner body works
try {
  const result = await plugin.apply({
    get(name) {
      const services = {
        llm: {
          registerAdapter: (providers, adapter) => {
            console.log('registerAdapter called with', providers)
          },
        },
      }
      return services[name]
    },
  }, {})
  console.log('apply returned:', result)
} catch (e) {
  console.log('apply THREW:', e.message)
  console.log(e.stack)
}
