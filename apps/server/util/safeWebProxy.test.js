import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConnectAuthority, startSafeWebProxy } from './safeWebProxy.js';

const closers = [];

afterEach(async () => {
  while (closers.length) await closers.pop()();
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

describe('safeWebProxy', () => {
  it('正确解析域名和 IPv6 CONNECT authority', () => {
    expect(parseConnectAuthority('example.com:443')).toEqual({ hostname: 'example.com', port: 443 });
    expect(parseConnectAuthority('[2606:4700:4700::1111]:443')).toEqual({
      hostname: '2606:4700:4700::1111',
      port: 443,
    });
  });

  it('HTTP 转发连接到 DNS 校验得到的固定 IP，同时保留原 Host', async () => {
    const target = http.createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ host: request.headers.host, path: request.url }));
    });
    const targetPort = await listen(target);
    closers.push(() => new Promise((resolve) => target.close(resolve)));

    const proxy = await startSafeWebProxy({
      allowedPorts: [targetPort],
      defaultPortsOnly: false,
      resolveAddresses: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    closers.push(() => proxy.close());
    const proxyPort = Number(new URL(proxy.url).port);

    const payload = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port: proxyPort,
          method: 'GET',
          path: `http://public.example:${targetPort}/article?q=1`,
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () => resolve({ status: response.statusCode, body }));
        },
      );
      request.on('error', reject);
      request.end();
    });

    expect(payload.status).toBe(200);
    expect(JSON.parse(payload.body)).toEqual({ host: `public.example:${targetPort}`, path: '/article?q=1' });
  });

  it('拒绝非 GET/HEAD 明文代理请求', async () => {
    const proxy = await startSafeWebProxy({ resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }] });
    closers.push(() => proxy.close());
    const proxyPort = Number(new URL(proxy.url).port);
    const status = await new Promise((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port: proxyPort, method: 'POST', path: 'http://example.com/' },
        (response) => resolve(response.statusCode),
      );
      request.on('error', reject);
      request.end('blocked');
    });
    expect(status).toBe(405);
  });
});
