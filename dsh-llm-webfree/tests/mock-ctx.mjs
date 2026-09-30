// Simulate dsh's reflect proxy ctx:
// Accessing ctx.X triggers a trap; if X is provided as an accessor def, it's called;
// otherwise a "cannot get property X without inject" error is thrown.
import { deepStrictEqual } from 'node:assert'

const propDefs = {
  llm: {
    type: 'accessor',
    get(receiver, _error) {
      return {
        registerAdapter: (providers, adapter) =>
          console.log('mock registerAdapter', providers, 'with adapter=', adapter?.constructor?.name),
      }
    },
  },
}

const ctx = new Proxy(
  {},
  {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop)
      if (prop in propDefs) {
        const def = propDefs[prop]
        if (def.type === 'accessor') return def.get(ctx, new Error('boom'))
      }
      // otherwise throw "cannot get property X without inject"
      const err = new Error(`cannot get property "${prop}" without inject`)
      throw err
    },
  },
)

const plugin = await import('../lib/index.js')
console.log('calling apply on mock ctx...')
try {
  await plugin.apply(ctx, {})
  console.log('apply ok')
} catch (e) {
  console.log('apply THREW:', e.message)
}
