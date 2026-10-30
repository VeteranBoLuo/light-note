import https from 'node:https';
import tls from 'node:tls';
import { lookupPublicAddresses, validatePublicWebUrl } from './webUrlSafety.js';

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

// Race only TLS handshakes, never HTTP requests. No credentials or OAuth code reach losing sockets.
export async function connectGitHubRelayTls(
  url,
  { signal, resolveIps = lookupPublicAddresses, connectTls = tls.connect } = {},
) {
  const addresses = await resolveIps(url.hostname);
  signal?.throwIfAborted();
  if (!addresses.length) throw relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const candidates = addresses.slice(0, 8);
    let remaining = candidates.length;
    let settled = false;
    const finish = (error, winner) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', aborted);
      for (const socket of sockets) if (socket !== winner) socket.destroy();
      if (error) reject(error);
      else resolve(winner);
    };
    const aborted = () => finish(relayError('GITHUB_OAUTH_RELAY_TIMEOUT'));
    signal?.addEventListener('abort', aborted, { once: true });
    const failed = () => {
      remaining -= 1;
      if (!remaining) finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE'));
    };
    for (const address of candidates) {
      try {
        const socket = connectTls({
          host: address.address,
          port: 443,
          family: address.family,
          servername: url.hostname,
          rejectUnauthorized: true,
        });
        sockets.add(socket);
        socket.once('secureConnect', () => {
          if (settled) socket.destroy();
          else finish(null, socket);
        });
        socket.once('error', () => {
          socket.destroy();
          failed();
        });
      } catch {
        failed();
      }
    }
  });
}

export function requestGitHubRelay(relay, payload, timeoutMs, { connect = connectGitHubRelayTls } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const controller = new AbortController();
    let settled = false;
    let timer;
    let req;
    let socket;
    let agent;
    let phase = 'CONNECT';
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      agent?.destroy();
      socket?.destroy();
      if (error) {
        error.transportPhase = phase;
        reject(error);
      } else resolve(result);
    };
    timer = setTimeout(() => {
      const error = relayError('GITHUB_OAUTH_RELAY_TIMEOUT');
      finish(error);
      req?.destroy(error);
    }, timeoutMs);
    Promise.resolve()
      .then(() => connect(new URL(relay.url), { signal: controller.signal }))
      .then((connected) => {
        if (settled) {
          connected.destroy();
          return;
        }
        socket = connected;
        phase = 'TLS_READY';
        // One new connection per request. The already authenticated winning socket is never pooled.
        agent = new https.Agent({ keepAlive: false });
        agent.createConnection = () => socket;
        req = https.request(
          relay.url,
          {
            method: 'POST',
            agent,
            headers: {
              authorization: `Bearer ${relay.token}`,
              'user-agent': 'light-note',
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
            },
          },
          (res) => {
            phase = 'RESPONSE_HEADERS';
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
        req.once('finish', () => {
          phase = 'REQUEST_SENT';
        });
        req.once('error', () => finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE')));
        req.end(body);
      })
      .catch(() => finish(relayError('GITHUB_OAUTH_RELAY_UNAVAILABLE')));
  });
}
