import https from 'node:https';
import webpush from 'web-push';
import { guardedHttpsAgent, validatePublicWebUrl } from './webUrlSafety.js';
import { validatePushSubscription } from './browserPushPolicy.js';

const transportError = (code = 'PUSH_TRANSPORT_ERROR') => Object.assign(new Error(code), { code });
const providerError = (statusCode) => Object.assign(new Error('PUSH_PROVIDER_REJECTED'), { statusCode });
const retryable = (error) => !error.statusCode || [408, 429].includes(error.statusCode) || error.statusCode >= 500;

// Operator configuration, never accepted from browser API requests. Max 30s per job (<90s lease).
export function browserPushRelays(env = process.env) {
  let relays;
  try {
    relays = JSON.parse(env.BROWSER_PUSH_RELAYS || '[]');
  } catch {
    throw transportError('PUSH_RELAY_CONFIG_INVALID');
  }
  if (!Array.isArray(relays) || relays.length > 2) throw transportError('PUSH_RELAY_CONFIG_INVALID');
  for (const relay of relays) {
    if (
      !relay ||
      typeof relay.url !== 'string' ||
      typeof relay.token !== 'string' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(relay.token)
    )
      throw transportError('PUSH_RELAY_CONFIG_INVALID');
    const url = validatePublicWebUrl(relay.url, { allowedPorts: [443] });
    if (url.protocol !== 'https:' || url.hash || url.search) throw transportError('PUSH_RELAY_CONFIG_INVALID');
  }
  return relays;
}

function postProvider(details) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      details.endpoint,
      { method: 'POST', agent: guardedHttpsAgent, headers: details.headers },
      (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 300) resolve({ statusCode: response.statusCode });
        else reject(providerError(response.statusCode));
      },
    );
    const deadline = setTimeout(() => request.destroy(transportError()), 10000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', () => reject(transportError()));
    request.end(details.body);
  });
}

function postRelay(relay, details) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      endpoint: details.endpoint,
      headers: details.headers,
      body: details.body.toString('base64'),
    });
    const request = https.request(
      relay.url,
      {
        method: 'POST',
        agent: guardedHttpsAgent,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${relay.token}`,
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > 1024) request.destroy(transportError('PUSH_RELAY_RESPONSE_INVALID'));
          else chunks.push(chunk);
        });
        response.on('error', () => reject(transportError()));
        response.on('end', () => {
          if (response.statusCode !== 200) return reject(transportError('PUSH_RELAY_UNAVAILABLE'));
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString());
            if (!Number.isInteger(result.upstreamStatus) || result.upstreamStatus < 200 || result.upstreamStatus > 599)
              throw transportError('PUSH_RELAY_RESPONSE_INVALID');
            if (result.upstreamStatus < 300) resolve({ statusCode: result.upstreamStatus });
            else reject(providerError(result.upstreamStatus));
          } catch (error) {
            reject(error.statusCode ? error : transportError('PUSH_RELAY_RESPONSE_INVALID'));
          }
        });
      },
    );
    const deadline = setTimeout(() => request.destroy(transportError('PUSH_RELAY_TIMEOUT')), 10000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', () => reject(transportError()));
    request.end(body);
  });
}

export async function deliverBrowserPush(subscription, payload, ttl, env = process.env, dependencies = {}) {
  validatePushSubscription(subscription);
  const relays = browserPushRelays(env);
  const options = {
    vapidDetails: {
      subject: env.BROWSER_PUSH_VAPID_SUBJECT,
      publicKey: env.BROWSER_PUSH_VAPID_PUBLIC_KEY,
      privateKey: env.BROWSER_PUSH_VAPID_PRIVATE_KEY,
    },
    TTL: Math.max(0, Math.min(86400, Math.floor(ttl))),
    timeout: 10000,
    agent: guardedHttpsAgent,
    urgency: 'normal',
  };
  const sendDirect =
    dependencies.direct || ((sub, text, config) => postProvider(webpush.generateRequestDetails(sub, text, config)));
  const sendRelay = dependencies.relay || postRelay;
  const generate = dependencies.generate || webpush.generateRequestDetails.bind(webpush);
  // Only FCM needs the alternate egress. Apple/Mozilla/WNS remain direct.
  const selected = new URL(subscription.endpoint).hostname === 'fcm.googleapis.com' ? relays : [];
  const serialized = JSON.stringify(payload);
  const started = Date.now();
  const remainingTtl = () => {
    const milliseconds = options.TTL * 1000 - (Date.now() - started);
    if (milliseconds <= 0) throw transportError('PUSH_EXPIRED');
    return Math.floor(milliseconds / 1000);
  };
  let lastError;
  for (const relay of selected) {
    try {
      const remaining = remainingTtl();
      const details = generate(subscription, serialized, { ...options, TTL: remaining });
      return await sendRelay(relay, details);
    } catch (error) {
      if (error.code === 'PUSH_EXPIRED' || !retryable(error)) throw error;
      lastError = error;
    }
  }
  try {
    return await sendDirect(subscription, serialized, {
      ...options,
      TTL: remainingTtl(),
    });
  } catch (error) {
    throw error.statusCode || error.code === 'PUSH_EXPIRED' ? error : lastError || transportError();
  }
}
