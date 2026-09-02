/**
 * Chromium 网页读取子进程使用的最小正向代理。
 *
 * 代理在每次连接前解析并校验全部 DNS 地址，再直接连接其中一个已校验 IP。
 * HTTPS 只建立到该固定 IP 的 CONNECT 隧道，TLS/SNI 仍由浏览器按原主机名完成。
 */

import http from 'node:http';
import net from 'node:net';
import { lookupPublicAddresses, validatePublicWebUrl } from './webUrlSafety.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function sanitizedHeaders(headers, host) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) result[key] = value;
  }
  if (host) result.host = host;
  return result;
}

function proxyErrorStatus(error) {
  const code = String(error?.code || error?.message || '');
  if (/BLOCKED_|URL_CREDENTIALS_FORBIDDEN|UNSUPPORTED_PROTOCOL|INVALID_/u.test(code)) return 403;
  return 502;
}

export function parseConnectAuthority(authority) {
  let parsed;
  try {
    parsed = new URL(`https://${String(authority || '')}`);
  } catch {
    throw Object.assign(new Error('INVALID_CONNECT_TARGET'), { code: 'INVALID_CONNECT_TARGET' });
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw Object.assign(new Error('INVALID_CONNECT_TARGET'), { code: 'INVALID_CONNECT_TARGET' });
  }
  return { hostname: parsed.hostname.replace(/^\[/u, '').replace(/\]$/u, ''), port: Number(parsed.port || 443) };
}

export async function startSafeWebProxy({
  allowedPorts = [80, 443],
  maxRequests = 80,
  connectTimeout = 6000,
  resolveAddresses = lookupPublicAddresses,
  defaultPortsOnly = true,
} = {}) {
  let requestCount = 0;
  const sockets = new Set();
  const claimRequest = () => {
    requestCount += 1;
    return requestCount <= maxRequests;
  };

  const server = http.createServer(async (request, response) => {
    if (!claimRequest()) {
      response.writeHead(429).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(String(request.method || '').toUpperCase())) {
      response.writeHead(405).end();
      return;
    }
    let target;
    try {
      target = validatePublicWebUrl(request.url, { allowedPorts, defaultPortsOnly });
      if (target.protocol !== 'http:')
        throw Object.assign(new Error('UNSUPPORTED_PROXY_REQUEST'), { code: 'UNSUPPORTED_PROXY_REQUEST' });
      const addresses = await resolveAddresses(target.hostname);
      const selected = addresses[0];
      if (!selected) throw Object.assign(new Error('DNS_EMPTY'), { code: 'DNS_EMPTY' });
      const upstream = http.request({
        hostname: selected.address,
        family: selected.family,
        port: Number(target.port || 80),
        path: `${target.pathname}${target.search}`,
        method: request.method,
        headers: sanitizedHeaders(request.headers, target.host),
        agent: false,
      });
      upstream.setTimeout(connectTimeout, () =>
        upstream.destroy(Object.assign(new Error('PROXY_TIMEOUT'), { code: 'PROXY_TIMEOUT' })),
      );
      upstream.on('response', (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode || 502, sanitizedHeaders(upstreamResponse.headers));
        upstreamResponse.pipe(response);
      });
      upstream.on('error', (error) => {
        if (!response.headersSent) response.writeHead(proxyErrorStatus(error));
        response.end();
      });
      request.on('aborted', () => upstream.destroy());
      request.pipe(upstream);
    } catch (error) {
      response.writeHead(proxyErrorStatus(error)).end();
    }
  });

  server.on('connect', async (request, clientSocket, head) => {
    if (!claimRequest()) {
      clientSocket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    let upstreamSocket;
    try {
      const authority = parseConnectAuthority(request.url);
      const formattedHostname = authority.hostname.includes(':') ? `[${authority.hostname}]` : authority.hostname;
      const target = validatePublicWebUrl(`https://${formattedHostname}:${authority.port}/`, {
        allowedPorts,
        defaultPortsOnly,
      });
      const addresses = await resolveAddresses(target.hostname);
      const selected = addresses[0];
      if (!selected) throw Object.assign(new Error('DNS_EMPTY'), { code: 'DNS_EMPTY' });
      upstreamSocket = net.connect({ host: selected.address, family: selected.family, port: authority.port });
      sockets.add(upstreamSocket);
      upstreamSocket.setTimeout(connectTimeout, () => upstreamSocket.destroy());
      upstreamSocket.once('connect', () => {
        upstreamSocket.setTimeout(0);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head?.length) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      });
      upstreamSocket.on('error', () => {
        if (!clientSocket.destroyed) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
      upstreamSocket.once('close', () => sockets.delete(upstreamSocket));
      clientSocket.once('close', () => upstreamSocket?.destroy());
      clientSocket.on('error', () => upstreamSocket?.destroy());
    } catch (error) {
      const status = proxyErrorStatus(error);
      clientSocket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\n\r\n`);
      upstreamSocket?.destroy();
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SAFE_PROXY_ADDRESS_UNAVAILABLE');
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    get requestCount() {
      return requestCount;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  });
}

export const safeWebProxyInternals = Object.freeze({ proxyErrorStatus, sanitizedHeaders });
