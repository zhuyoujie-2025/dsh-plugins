// dsh-mobile-gate — Cordis plugin entry
// LAN mobile gateway for DeepSeek Harness (DSH): spawns an isolated Node HTTP
// gateway (lib/lan-gate-server.cjs) listening on 0.0.0.0, reverse-proxying to
// the local DSH Web UI with first-visit approval, per-device tokens, rate
// limiting, and mobile layout injection.
//
// Mount via cordis.patch.yml (see cordis.patch.yml.example) or use the code
// below as a dynamic plugin package in a DSH session.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const name = 'dsh-mobile-gate'
export const inject = ['subprocess']

const here = dirname(fileURLToPath(import.meta.url))
const serverFile = join(here, 'lib', 'lan-gate-server.cjs')

// 2026-09-29 own-port 补丁：转发目标默认跟随本内核实际 --port（官方桌面端
// 端口是动态的，固化 env 会指错实例）。优先级：
//   config.targetPort > 本进程 --port argv > LAN_GATE_TARGET_PORT 环境变量 > 3080
// 监听端口仍走 config.listenPort > LAN_GATE_PORT > 3088（部署方可用
// env 显式固定监听口，行为不变）。
function envNumber(key) {
  const n = Number(process.env[key])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function ownKernelPort() {
  const argv = process.argv || []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port' || a === '-p') {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n > 0) return n
    }
    const m = /^--port=(\d+)$/.exec(a)
    if (m) return Number(m[1])
  }
  return undefined
}

export function apply(ctx) {
  const timer = ctx.get('timer')
  // ctx.config requires a 'config' inject declaration; use the non-throwing
  // ctx.get() so the plugin still loads when no config service is provided.
  let cfg = {}
  try {
    const c = ctx.get('config')
    cfg = (c && typeof c === 'object') ? c : {}
  } catch (e) { /* config not injected */ }
  const targetPort = cfg.targetPort ?? ownKernelPort() ?? envNumber('LAN_GATE_TARGET_PORT')
  const listenPort = cfg.listenPort ?? envNumber('LAN_GATE_PORT')
  const listenHost = cfg.listenHost ?? process.env.LAN_GATE_HOST
  if (targetPort !== undefined) process.env.LAN_GATE_TARGET_PORT = String(targetPort)
  if (listenPort !== undefined) process.env.LAN_GATE_PORT = String(listenPort)
  if (listenHost !== undefined) process.env.LAN_GATE_HOST = String(listenHost)
  let handle = null

  const start = async () => {
    try {
      const nodePath = await ctx.subprocess.resolveExecutable('node')
      handle = ctx.subprocess.spawn({
        argv: [nodePath, serverFile],
        cwd: here,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 131072 },
          stderr: { maxBytes: 131072 },
        },
        graceMs: 3000,
      })
      handle.done.then((outcome) => {
        console.log(`[dsh-mobile-gate] server exited code=${outcome.exitCode} signal=${outcome.signal}`)
      }).catch((err) => {
        console.error(`[dsh-mobile-gate] spawn failed: ${String(err && err.message || err)}`)
      })
      if (timer) {
        timer.timeout(() => {
          const r = handle && handle.collected && handle.collected.stdout
          if (r) {
            const read = r.readFrom(0)
            if (read && read.text) console.log(`[dsh-mobile-gate] ${read.text.trim()}`)
          }
          const e = handle && handle.collected && handle.collected.stderr
          if (e) {
            const eread = e.readFrom(0)
            if (eread && eread.text) console.error(`[dsh-mobile-gate] stderr: ${eread.text.trim()}`)
          }
        }, 1500)
      }
    } catch (err) {
      console.error(`[dsh-mobile-gate] ${String(err && err.message || err)}`)
    }
  }

  start()

  ctx.effect(() => {
    return () => {
      if (handle) {
        try { handle.terminate() } catch (e) { /* ignore */ }
      }
    }
  })
}
