import http from 'node:http';
import {
  HOST_AGENT_ENDPOINTS,
  assertHostAgentProtocolVersion,
  hostAgentLogsPath,
} from '@lightnote/shared/host-agent-protocol';

const DEFAULT_SOCKET_PATH = '/run/lightnote-host-agent/agent.sock';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class HostAgentClientError extends Error {
  constructor(code, message, status = 503, details = {}) {
    super(message);
    this.name = 'HostAgentClientError';
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function socketPath(environment = process.env) {
  const value = String(environment.HOST_AGENT_SOCKET_PATH || DEFAULT_SOCKET_PATH).trim();
  if (!value.startsWith('/') || value.includes('\0') || value.includes('\n')) {
    throw new HostAgentClientError('HOST_AGENT_CONFIG_INVALID', 'Host Agent 配置无效', 500);
  }
  return value;
}

export function requestHostAgent(
  path,
  { method = 'GET', body = null, timeoutMs = 5000, environment = process.env, requester = http.request } = {},
) {
  const encodedBody = body == null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      handler();
    };
    const request = requester(
      {
        socketPath: socketPath(environment),
        path,
        method,
        headers: encodedBody
          ? { 'Content-Type': 'application/json', 'Content-Length': encodedBody.length, Connection: 'close' }
          : { Connection: 'close' },
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            request.destroy();
            finish(() =>
              reject(new HostAgentClientError('HOST_AGENT_RESPONSE_TOO_LARGE', 'Host Agent 响应超过安全上限')),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          finish(() => {
            let payload;
            try {
              payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
              assertHostAgentProtocolVersion(payload.protocolVersion);
            } catch (error) {
              const code =
                error?.code === 'HOST_AGENT_PROTOCOL_INCOMPATIBLE' ? error.code : 'HOST_AGENT_RESPONSE_INVALID';
              return reject(new HostAgentClientError(code, 'Host Agent 响应协议无效'));
            }
            if (!payload.ok || Number(response.statusCode || 500) >= 400) {
              return reject(
                new HostAgentClientError(
                  String(payload?.error?.code || 'HOST_AGENT_REQUEST_FAILED'),
                  String(payload?.error?.message || 'Host Agent 请求失败').slice(0, 200),
                  Number(response.statusCode || 503),
                ),
              );
            }
            return resolve(payload.data);
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish(() => reject(new HostAgentClientError('HOST_AGENT_TIMEOUT', 'Host Agent 响应超时')));
    });
    request.on('error', (error) =>
      finish(() =>
        reject(
          new HostAgentClientError('HOST_AGENT_OFFLINE', 'Host Agent 当前不可用', 503, {
            causeCode: String(error?.code || 'UNKNOWN').slice(0, 40),
          }),
        ),
      ),
    );
    if (encodedBody) request.write(encodedBody);
    request.end();
  });
}

export function getHostAgentDashboard(options) {
  return requestHostAgent(HOST_AGENT_ENDPOINTS.dashboard, { ...options, timeoutMs: 7000 });
}

export function getHostAgentLogs(serviceId, limit, options) {
  return requestHostAgent(hostAgentLogsPath(serviceId, limit), { ...options, timeoutMs: 10_000 });
}

export function executeHostAgentJob(job, options) {
  return requestHostAgent(HOST_AGENT_ENDPOINTS.jobs, { ...options, method: 'POST', body: job, timeoutMs: 30_000 });
}

export const hostAgentClientInternals = { socketPath, MAX_RESPONSE_BYTES };
