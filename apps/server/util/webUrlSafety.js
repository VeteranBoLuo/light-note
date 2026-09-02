/**
 * 服务端读取用户 URL 时共用的 SSRF 边界。
 *
 * 域名必须一次解析出全部地址，任一地址属于本机、内网、链路本地或保留网段时，
 * 整个目标都拒绝；实际连接继续使用本 lookup 返回的已校验地址，避免校验后由另一
 * 次 DNS 解析把连接切到内网（DNS rebinding / TOCTOU）。
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns';

const BLOCKED_HOST_SUFFIXES = Object.freeze(['.localhost', '.local', '.internal', '.home.arpa']);

function safetyError(code) {
  return Object.assign(new Error(code), { code });
}

function parseIpv4Number(address) {
  const parts = String(address || '').split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function ipv4InSubnet(value, network, prefix) {
  if (prefix === 0) return true;
  const shift = 32 - prefix;
  return value >>> shift === network >>> shift;
}

function isBlockedIpv4(address) {
  const value = parseIpv4Number(address);
  if (value === null) return true;
  const subnets = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];
  return subnets.some(([network, prefix]) => ipv4InSubnet(value, parseIpv4Number(network), prefix));
}

function expandIpv6(address) {
  let source = String(address || '')
    .toLowerCase()
    .split('%', 1)[0];
  const ipv4Tail = source.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4Number(ipv4Tail);
    if (ipv4 === null) return null;
    source =
      source.slice(0, -ipv4Tail.length) + `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  if ((source.match(/::/gu) || []).length > 1) return null;
  const [leftSource, rightSource = ''] = source.split('::');
  const left = leftSource ? leftSource.split(':') : [];
  const right = rightSource ? rightSource.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((source.includes('::') && missing < 1) || (!source.includes('::') && missing !== 0)) return null;
  const groups = source.includes('::') ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;
  return groups.reduce((value, part) => (value << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function ipv6Network(value, prefix) {
  return value >> BigInt(128 - prefix);
}

function ipv6InSubnet(value, network, prefix) {
  const base = expandIpv6(network);
  return base !== null && ipv6Network(value, prefix) === ipv6Network(base, prefix);
}

function isBlockedIpv6(address) {
  const value = expandIpv6(address);
  if (value === null) return true;

  // IPv4-mapped 地址按其最后 32 位继续走 IPv4 网段判断。
  if (value >> 32n === 0xffffn) {
    const ipv4 = Number(value & 0xffffffffn);
    const dotted = [24, 16, 8, 0].map((shift) => (ipv4 >>> shift) & 0xff).join('.');
    return isBlockedIpv4(dotted);
  }

  // 已废弃的 IPv4-compatible ::/96 以及未指定/环回地址不允许作为公网目标。
  if (value >> 32n === 0n) return true;
  const subnets = [
    ['64:ff9b::', 96], // NAT64 well-known prefix，可嵌入私网 IPv4
    ['100::', 64], // discard-only
    ['2001::', 32], // Teredo，可嵌入 IPv4
    ['2001:2::', 48], // benchmark
    ['2001:10::', 28], // ORCHID
    ['2001:20::', 28], // ORCHIDv2
    ['2001:db8::', 32], // 文档保留
    ['2002::', 16], // 6to4，可嵌入 IPv4
    ['fc00::', 7], // ULA
    ['fe80::', 10], // link-local
    ['fec0::', 10], // deprecated site-local
    ['ff00::', 8], // multicast
  ];
  return subnets.some(([network, prefix]) => ipv6InSubnet(value, network, prefix));
}

export function isBlockedNetworkAddress(address) {
  const family = net.isIP(String(address || ''));
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function normalizedPort(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

export function validatePublicWebUrl(rawUrl, { allowedPorts, defaultPortsOnly = false } = {}) {
  let parsed;
  try {
    parsed = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(String(rawUrl || ''));
  } catch {
    throw safetyError('INVALID_URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw safetyError('UNSUPPORTED_PROTOCOL');
  if (parsed.username || parsed.password) throw safetyError('URL_CREDENTIALS_FORBIDDEN');
  const hostname = parsed.hostname.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw safetyError('BLOCKED_HOST');
  }
  if (net.isIP(hostname) && isBlockedNetworkAddress(hostname)) throw safetyError('BLOCKED_HOST');
  const port = normalizedPort(parsed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw safetyError('INVALID_PORT');
  if (Array.isArray(allowedPorts) && !allowedPorts.includes(port)) throw safetyError('BLOCKED_PORT');
  if (
    defaultPortsOnly &&
    ((parsed.protocol === 'http:' && port !== 80) || (parsed.protocol === 'https:' && port !== 443))
  ) {
    throw safetyError('BLOCKED_PORT');
  }
  parsed.hash = '';
  return parsed;
}

export async function lookupPublicAddresses(hostname, { lookup = dnsLookup } = {}) {
  const normalizedHost = String(hostname || '')
    .replace(/^\[/u, '')
    .replace(/\]$/u, '')
    .toLowerCase();
  if (net.isIP(normalizedHost)) {
    if (isBlockedNetworkAddress(normalizedHost)) throw safetyError('BLOCKED_PRIVATE_IP');
    return [{ address: normalizedHost, family: net.isIP(normalizedHost) }];
  }
  const addresses = await new Promise((resolve, reject) => {
    lookup(normalizedHost, { all: true, verbatim: true }, (error, result, family) => {
      if (error) return reject(error);
      resolve(Array.isArray(result) ? result : [{ address: result, family }]);
    });
  });
  const unique = [
    ...new Map(
      addresses
        .map((item) => ({ address: String(item?.address || ''), family: Number(item?.family || 0) }))
        .filter((item) => net.isIP(item.address) === item.family)
        .map((item) => [`${item.family}:${item.address}`, item]),
    ).values(),
  ];
  if (!unique.length) throw safetyError('DNS_EMPTY');
  if (unique.some((item) => isBlockedNetworkAddress(item.address))) throw safetyError('BLOCKED_PRIVATE_IP');
  return unique;
}

/** Node http(s).Agent 兼容 lookup：解析、校验和实际连接共享同一批地址。 */
export function guardedPublicLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof options === 'number') {
    options = { family: options };
  }
  const lookupOptions = options || {};
  lookupPublicAddresses(hostname)
    .then((addresses) => {
      const requestedFamily = Number(lookupOptions.family || 0);
      const matching = requestedFamily ? addresses.filter((item) => item.family === requestedFamily) : addresses;
      if (!matching.length) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      if (lookupOptions.all) callback(null, matching);
      else callback(null, matching[0].address, matching[0].family);
    })
    .catch((error) => callback(error));
}

export const guardedHttpAgent = new http.Agent({ lookup: guardedPublicLookup });
export const guardedHttpsAgent = new https.Agent({ lookup: guardedPublicLookup });

export const webUrlSafetyInternals = Object.freeze({ expandIpv6, normalizedPort, parseIpv4Number });
