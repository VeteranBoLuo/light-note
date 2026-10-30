import https from 'node:https';
import { guardedPublicLookup, validatePublicWebUrl } from './webUrlSafety.js';

const relayError = (code) => Object.assign(new Error(code), { code });

// Only operator configuration can select the relay. Browser input never supplies an upstream URL.
export function githubOAuthRelay(env = process.env) {
  const address = String(env.GITHUB_OAUTH_RELAY_URL || '').trim();
  const token = String(env.GITHUB_OAUTH_RELAY_TOKEN || '').trim();
  if (!address && !token) return null;
  try {
    // The shared URL validator intentionally strips fragments; configuration must reject them first.
    if (new URL(address).hash) throw new Error('invalid');
    const url = validatePublicWebUrl(address, { allowedPorts: [443] });
    if (
      url.protocol !== 'https:' ||
      url.pathname !== '/github' ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(token)
    )
      throw new Error('invalid');
    return { url: url.href, token };
  } catch {
    throw Object.assign(relayError('GITHUB_OAUTH_RELAY_CONFIG_INVALID'), { status: 503, stage: 'TOKEN_CONNECT' });
  }
}

export function requestGitHubRelay(relay, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const req = https.request(
      relay.url,
      {
        method: 'POST',
        // Fresh connection, with DNS validation on the actual socket, including IPv4/IPv6.
        agent: false,
        lookup: guardedPublicLookup,
        headers: {
          authorization: `Bearer ${relay.token}`,
          'user-agent': 'light-note',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 256 * 1024) req.destroy(relayError('GITHUB_OAUTH_RELAY_RESPONSE_INVALID'));
          else chunks.push(chunk);
        });
        res.once('error', () => finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE')));
        res.once('aborted', () => finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE')));
        res.once('end', () => {
          if (size > 256 * 1024) return;
          if (res.statusCode !== 200) return finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE'));
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (
              !Number.isInteger(result.status) ||
              result.status < 200 ||
              result.status > 599 ||
              typeof result.body !== 'string' ||
              Buffer.byteLength(result.body) > 64 * 1024 ||
              !result.headers ||
              typeof result.headers !== 'object' ||
              Array.isArray(result.headers)
            ) {
              throw new Error('invalid envelope');
            }
            const headers = {};
            for (const key of ['retry-after', 'x-ratelimit-remaining']) {
              if (result.headers[key] != null) {
                if (typeof result.headers[key] !== 'string' || !/^\d{1,12}$/.test(result.headers[key])) {
                  throw new Error('invalid header');
                }
                headers[key] = result.headers[key];
              }
            }
            finish(null, { status: result.status, body: result.body, headers });
          } catch {
            finish(relayError('GITHUB_OAUTH_RELAY_RESPONSE_INVALID'));
          }
        });
      },
    );
    timer = setTimeout(() => req.destroy(relayError('GITHUB_OAUTH_RELAY_TIMEOUT')), timeoutMs);
    req.once('error', () => finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE')));
    req.end(body);
  });
}
