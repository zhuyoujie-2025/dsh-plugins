/**
 * Version-direction unit tests for update detection (#64).
 *
 * The reported failure: `@deepseek-ai/dsh-web-fetch-http` was pinned at
 * 0.1.0-rc.6 while the registry's `latest` dist-tag was still on the first
 * release, 0.0.1-rc.5. Detection compared with `!==`, so the older tag read
 * as "an update", and applying it downgraded the profile until it wouldn't
 * boot. Direction — not inequality — is what decides.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkUpdates, compareVersions, isUpgrade } from '../src/updates.ts'

describe('compareVersions', () => {
  it('orders by major, minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.10')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0)
  })

  it('ranks a release above any prerelease of the same core', () => {
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
  })

  it('orders prerelease identifiers per semver precedence', () => {
    expect(compareVersions('1.0.0-rc.10', '1.0.0-rc.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc')).toBeGreaterThan(0)
    // Numeric identifiers rank below alphanumeric ones.
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
  })

  it('reproduces the precedence chain from the semver spec', () => {
    const ordered = [
      '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta',
      '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0',
    ]
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareVersions(ordered[i], ordered[i + 1])).toBeLessThan(0)
      expect(compareVersions(ordered[i + 1], ordered[i])).toBeGreaterThan(0)
    }
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.2.3+build.5', '1.2.3')).toBe(0)
  })

  it('returns null when either side is not plain semver', () => {
    expect(compareVersions('^1.2.3', '1.2.3')).toBeNull()
    expect(compareVersions('1.2', '1.2.3')).toBeNull()
    expect(compareVersions('latest', '1.2.3')).toBeNull()
  })
})

describe('isUpgrade', () => {
  it('reports an upgrade only when latest is genuinely newer', () => {
    expect(isUpgrade('1.0.0', '1.2.0')).toBe(true)
    expect(isUpgrade('1.0.0-rc.1', '1.0.0')).toBe(true)
  })

  it('does not treat an equal version as an update', () => {
    expect(isUpgrade('1.2.0', '1.2.0')).toBe(false)
  })

  it('does not treat a LOWER latest dist-tag as an update (#64)', () => {
    // The exact versions from the report.
    expect(isUpgrade('0.1.0-rc.6', '0.0.1-rc.5')).toBe(false)
    expect(isUpgrade('2.0.0', '1.9.9')).toBe(false)
  })

  it('reports no update when a version is missing or undecidable', () => {
    expect(isUpgrade(null, '1.2.0')).toBe(false)
    expect(isUpgrade('1.0.0', null)).toBe(false)
    expect(isUpgrade('not-a-version', '1.2.0')).toBe(false)
  })
})

/**
 * checkUpdates itself — the resolution around those comparisons. Only the
 * pure helpers above had unit coverage; the github branch (pinned commit vs
 * the repo's HEAD) reached the suite solely through whole-route flow tests,
 * where a mutation could drop the sha check or invert the availability
 * condition and nothing failed.
 *
 * Getting this wrong is not cosmetic: a plugin that reads "up to date" when
 * it is not never surfaces its fix, and one that always claims an update
 * makes the button lie on every poll.
 */
describe('checkUpdates — github pins', () => {
  const HEAD = 'a'.repeat(40)
  const OLD = 'b'.repeat(40)
  let home: string

  /** Profile with one github-installed plugin pinned at `commit`. */
  function profileWith(spec: string, commit: string | null): string {
    const dir = join(mkdtempSync(join(tmpdir(), 'dshm-upd-')), 'profiles', 'web')
    mkdirSync(join(dir, 'node_modules', 'themer'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { themer: spec } }))
    writeFileSync(join(dir, 'node_modules', 'themer', 'package.json'), JSON.stringify({ name: 'themer', version: '1.0.0' }))
    writeFileSync(join(dir, 'pnpm-lock.yaml'), commit === null ? 'lockfileVersion: 9\n'
      : `  resolution: {tarball: https://codeload.github.com/owner/themer/tar.gz/${commit}}\n`)
    return dir
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dshm-updhome-'))
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ sha: HEAD }),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(home, { recursive: true, force: true })
  })

  it('flags an update when the pinned commit differs from HEAD', async () => {
    const result = await checkUpdates('web', true, profileWith('github:owner/themer', OLD))
    expect(result.themer).toMatchObject({ kind: 'github', current: OLD, latest: HEAD, updateAvailable: true })
  })

  it('reports no update when the pin already IS HEAD', async () => {
    const result = await checkUpdates('web', true, profileWith('github:owner/themer', HEAD))
    expect(result.themer).toMatchObject({ current: HEAD, latest: HEAD, updateAvailable: false })
  })

  it('claims no update when the pin is unknown — an unknown is not a difference', async () => {
    // No lockfile entry: `current` is null. Reporting an update here would
    // offer a reinstall the user cannot evaluate.
    const result = await checkUpdates('web', true, profileWith('github:owner/themer', null))
    expect(result.themer).toMatchObject({ current: null, latest: HEAD, updateAvailable: false })
  })

  it('claims no update when the API answers without a usable sha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
    expect(await checkUpdates('web', true, profileWith('github:owner/themer', OLD)))
      .toMatchObject({ themer: { latest: null, updateAvailable: false } })

    // A sha of the wrong TYPE is the case a truthiness check would let
    // through: it is not a commit, so it cannot mean "newer".
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ sha: 12345 }) })))
    expect(await checkUpdates('web', true, profileWith('github:owner/themer', OLD)))
      .toMatchObject({ themer: { latest: null, updateAvailable: false } })
  })

  it('treats a bare owner/repo spec as npm, not as a github pin', async () => {
    // pnpm accepts the shorthand, and it parses as a repo — but without the
    // `github:` prefix the package came from the registry, so asking GitHub
    // for a HEAD commit would compare two unrelated things.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: '1.0.0' }) })))
    const result = await checkUpdates('web', true, profileWith('owner/themer', OLD))
    expect(result.themer).toMatchObject({ kind: 'npm' })
  })

  it('never offers an update for a linked or file: dependency', async () => {
    for (const spec of ['link:../themer', 'file:/tmp/themer.tgz']) {
      const result = await checkUpdates('web', true, profileWith(spec, OLD))
      expect(result.themer, spec).toMatchObject({ kind: 'linked', updateAvailable: false })
    }
  })
})
