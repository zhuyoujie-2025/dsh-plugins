// dsh-notifier adapter: smtp（QQ/163/Gmail 等标准 SMTP 邮箱推送）
// 零依赖实现：node:tls 直连 465（SSL 隐式加密）。
// 配置：host（默认 smtp.qq.com）、port（默认 465）、user（发件邮箱）、
//   pass（SMTP 授权码，secret，非登录密码）、to（收件邮箱，默认=user）、
//   fromName（可选显示名）、timeoutMs、keyFile（可选：account=/auth_code=
//   键值文件路径，user/pass 缺省时从此读取，如 ~/.private-keys/mail.auth）。

import tls from 'node:tls'
import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { NotifyError, ERROR_CODES, str, num } from './_shared.mjs'

export const type = 'smtp'

const CRLF = '\r\n'
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
/** RFC2047：非 ASCII 头部字段编码。 */
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)

/** 读取 keyFile 凭据（account=/auth_code= 键值行）。 */
async function loadKeyFile(path) {
  const text = await readFile(path, 'utf8')
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^([a-z_]+)\s*=\s*(.+)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

/** 校验并归一化配置（同步——注册表调用方不 await）；缺失抛中文指引。 */
export function resolve(cfg = {}) {
  const user = str(cfg.user)
  const pass = str(cfg.pass)
  const keyFile = str(cfg.keyFile)
  const needKeyFile = user === '' || pass === ''
  if (needKeyFile && keyFile === '') {
    throw new NotifyError('smtp 未配置：需 user+pass（授权码）或 keyFile 凭据文件路径', ERROR_CODES.NOT_CONFIGURED)
  }
  const port = num(cfg.port, 465, 1, 65535)
  return {
    host: str(cfg.host) || 'smtp.qq.com',
    port,
    user,
    pass,
    keyFile: needKeyFile ? keyFile : '',
    to: str(cfg.to) || user,
    fromName: str(cfg.fromName),
    timeoutMs: num(cfg.timeoutMs, 10000, 2000, 60000),
  }
}

/** 读一个完整 SMTP 响应块（多行 "250-..." 以 "250 " 收尾），返回状态码。 */
function readReply(buf) {
  const idx = buf.indexOf(CRLF)
  if (idx === -1) return null
  // 找最后一个完整块：逐行看是否出现 "ddd " 收尾行
  const lines = buf.split(CRLF)
  for (let i = 0; i < lines.length - 1; i++) {
    const m = /^(\d{3}) /.exec(lines[i])
    if (m) {
      const end = lines.slice(0, i + 1).join(CRLF).length + CRLF.length
      return { code: Number(m[1]), consumed: end }
    }
    // "ddd-" 续行：继续看下一行
    if (!/^\d{3}-/.test(lines[i])) return null
  }
  return null
}

/** 执行 SMTP 会话：问候(220) → steps 依次 (发送指令→等预期码)。 */
function smtpSession(sock, timeoutMs, steps) {
  return new Promise((resolvePromise, reject) => {
    let buf = ''
    let phase = 'greeting' // greeting | step | done
    let stepIdx = 0

    const timer = setTimeout(() => {
      sock.destroy()
      reject(new NotifyError('smtp 会话超时', ERROR_CODES.TIMEOUT))
    }, timeoutMs)

    const done = () => {
      clearTimeout(timer)
      sock.end()
      resolvePromise()
    }
    const fail = (msg, code = ERROR_CODES.API_ERROR) => {
      clearTimeout(timer)
      sock.destroy()
      reject(new NotifyError(msg, code))
    }
    const sendStep = () => {
      const step = steps[stepIdx]
      if (!step) return done()
      if (step.line !== '') sock.write(step.line + CRLF)
      phase = 'step'
    }

    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const reply = readReply(buf)
      if (!reply) return
      buf = buf.slice(reply.consumed)
      if (phase === 'greeting') {
        if (reply.code !== 220) return fail(`smtp 服务端问候异常（${reply.code}）`)
        return sendStep()
      }
      const step = steps[stepIdx]
      const expected = step.expect ?? [250]
      if (!expected.includes(reply.code)) {
        return fail(`smtp 指令被拒（${reply.code}）：${step.hint}`)
      }
      stepIdx += 1
      sendStep()
    })
    sock.on('error', (err) => fail(`smtp 连接失败：${err.message}`, ERROR_CODES.NETWORK_ERROR))
    sock.on('close', () => {
      if (stepIdx < steps.length - 1) {
        fail('smtp 连接被对端提前关闭', ERROR_CODES.NETWORK_ERROR)
      } else if (phase !== 'done') {
        // 最后一条 QUIT 已发出、对端直接断线：视为投递完成
        clearTimeout(timer)
        resolvePromise()
      }
    })
  })
}

/** 发送通知；标题进 Subject，正文 = 标题 + 空行 + 内容（base64 UTF-8）。 */
export async function send(resolved, msg) {
  // keyFile 惰性加载：resolve 必须同步（注册表调用方不 await），凭据在发送时读盘。
  let { user, pass } = resolved
  if (resolved.keyFile !== '') {
    try {
      const kv = await loadKeyFile(resolved.keyFile)
      if (user === '') user = str(kv.account)
      if (pass === '') pass = str(kv.auth_code)
    } catch {
      throw new NotifyError(`smtp 凭据文件不可读：${resolved.keyFile}`, ERROR_CODES.NOT_CONFIGURED)
    }
  }
  if (user === '' || pass === '') {
    throw new NotifyError('smtp 凭据为空：keyFile 需含 account=/auth_code= 两行', ERROR_CODES.NOT_CONFIGURED)
  }
  const to = resolved.to !== '' ? resolved.to : user
  const fromAddr = resolved.fromName !== ''
    ? `${encHeader(resolved.fromName)} <${user}>`
    : user
  const bodyText = [msg.title, msg.content].filter(Boolean).join('\n\n')

  // 附件：msg.attachments = [{ path, filename?, contentType? }]（path 读盘 base64；
  // 也可直接给 { filename, contentBase64 }）。有附件时正文改 multipart/mixed。
  const attachments = []
  for (const att of Array.isArray(msg.attachments) ? msg.attachments : []) {
    if (att === null || typeof att !== 'object') continue
    const filename = str(att.filename) || (typeof att.path === 'string' ? basename(att.path) : 'attachment.bin')
    let contentBase64 = str(att.contentBase64)
    if (contentBase64 === '' && typeof att.path === 'string' && att.path !== '') {
      contentBase64 = (await readFile(att.path)).toString('base64')
    }
    if (contentBase64 === '') continue
    attachments.push({
      filename,
      contentType: str(att.contentType) || 'application/octet-stream',
      contentBase64,
    })
  }

  let dataBlock
  if (attachments.length === 0) {
    dataBlock = [
      `From: ${fromAddr}`,
      `To: ${to}`,
      `Subject: ${encHeader(msg.title || 'DSH 通知')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(bodyText).replace(/.{1,76}/g, '$&\r\n'),
      '.',
    ].join(CRLF)
  } else {
    const boundary = `----dsh-smtp-${Date.now().toString(36)}`
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(bodyText).replace(/.{1,76}/g, '$&\r\n'),
    ]
    for (const att of attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${encHeader(att.filename)}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${encHeader(att.filename)}"`,
        '',
        att.contentBase64.replace(/.{1,76}/g, '$&\r\n'),
      )
    }
    parts.push(`--${boundary}--`, '', '.')
    dataBlock = [
      `From: ${fromAddr}`,
      `To: ${to}`,
      `Subject: ${encHeader(msg.title || 'DSH 通知')}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join(CRLF)
  }

  const steps = [
    { line: 'EHLO dsh-notifier.local', expect: [250], hint: 'EHLO' },
    { line: 'AUTH LOGIN', expect: [334], hint: 'AUTH LOGIN' },
    { line: b64(user), expect: [334], hint: '账号发送' },
    { line: b64(pass), expect: [235], hint: '授权码校验失败：确认是 SMTP 授权码而非登录密码' },
    { line: `MAIL FROM:<${user}>`, expect: [250], hint: 'MAIL FROM' },
    { line: `RCPT TO:<${to}>`, expect: [250, 251], hint: 'RCPT TO（收件地址被拒）' },
    { line: 'DATA', expect: [354], hint: 'DATA' },
    { line: dataBlock, expect: [250], hint: '邮件正文投递' },
    { line: 'QUIT', expect: [221, 250], hint: 'QUIT' },
  ]

  const sock = tls.connect({ host: resolved.host, port: resolved.port, servername: resolved.host })
  await smtpSession(sock, resolved.timeoutMs, steps)
}
