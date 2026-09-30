import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject } from '../src/client/index.js'

describe('composer bottom seal client plugin', () => {
  it('has no hard service dependency', () => { assert.deepEqual(inject, []) })
  it('mounts one stable-selector style and removes only its own style on dispose', () => {
    let appended
    let removed = false
    const existing = new Map()
    globalThis.document = {
      getElementById(id) { return existing.get(id) ?? null },
      createElement(tag) {
        assert.equal(tag, 'style')
        return { id: '', textContent: '', remove() { removed = true; existing.delete(this.id) } }
      },
      head: { appendChild(node) { appended = node; existing.set(node.id, node) } },
    }
    let dispose
    const ctx = { effect(factory) { dispose = factory() } }
    apply(ctx)
    assert.equal(appended.id, 'dsh-composer-bottom-seal-style')
    assert.match(appended.textContent, /\[data-composer-seat\]/)
    assert.match(appended.textContent, /:has\(> \[data-composer-card\]\)/)
    assert.match(appended.textContent, /padding-bottom:\s*0/)
    assert.match(appended.textContent, /\[data-conversation-scroll\][\s\S]*margin-bottom:\s*-2px/)
    assert.match(appended.textContent, /\[data-phase=['"]active['"]\][\s\S]*\[data-composer-seat\][\s\S]*background:\s*transparent/)
    dispose()
    assert.equal(removed, true)
    delete globalThis.document
  })
})
