// ds-tls-relay.js — 本地 TLS 中继（dsh-deepseek-web-bridge 的可选配套工具）
// 适用场景：ds-free-api（wreq 网络栈）在某些运行环境无法对 https://chat.deepseek.com
// 完成 TLS 握手时，用本脚本在回环口搭一条中继——监听 127.0.0.1:22219，
// 把请求原样转发到 chat.deepseek.com（Node 的 TLS 正常），SSE 流式回传。
// 用法: node ds-tls-relay.js  （长期运行；让 ds-free-api 上游指向 127.0.0.1:22219）

const http = require('http');
const https = require('https');

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = 22219;
const UPSTREAM_HOST = 'chat.deepseek.com';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

const agent = new https.Agent({ keepAlive: true, maxSockets: 32 });

const server = http.createServer((req, res) => {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers['host'] = UPSTREAM_HOST;

  const upstream = https.request(
    {
      host: UPSTREAM_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers,
      agent,
      rejectUnauthorized: true,
    },
    (upRes) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v;
      }
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    console.error(`[relay] upstream error ${req.method} ${req.url}: ${err.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `relay upstream error: ${err.message}` } }));
  });

  req.on('error', () => upstream.destroy());
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });

  req.pipe(upstream);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[relay] listening on http://${LISTEN_HOST}:${LISTEN_PORT} -> https://${UPSTREAM_HOST}`);
});
