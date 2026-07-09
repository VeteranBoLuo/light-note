import net from 'node:net';
import https from 'node:https';

/**
 * GitHub OAuth token 交换的「多 IP 竞速」实现。
 *
 * 背景:code→token 只能走 github.com,而国内服务器到 github.com 常被 GFW 间歇性 TCP 封锁
 * (SYN 被丢、connect 超时),同一 DNS IP 反复重试无用。api.github.com 是另一 IP 段、通常正常。
 * 策略:硬编码一组 github.com 官方 IP,先并发 TCP 探测出「当下可达」的 IP,再用它发 token 请求
 * (TLS SNI / HTTP Host 仍为 github.com,证书按 github.com 校验)。只要任一 IP 当下通即成功。
 *
 * IP 若整体失效,可从 https://api.github.com/meta 的 web 段刷新(api.github.com 一般可达)。
 */
const GITHUB_HOST_IPS = [
  '140.82.121.4',
  '140.82.121.3',
  '140.82.116.3',
  '140.82.114.3',
  '140.82.113.3',
  '140.82.112.3',
  '20.27.177.113',
  '20.205.243.166',
];

// 并发 TCP 探测,返回当下可连通的 IP(过滤掉超时/拒绝的)
function probeReachableIps(ips, port = 443, timeoutMs = 3000) {
  return Promise.all(
    ips.map(
      (ip) =>
        new Promise((resolve) => {
          const sock = net.connect({ host: ip, port });
          const finish = (ok) => {
            sock.destroy();
            resolve(ok ? ip : null);
          };
          sock.setTimeout(timeoutMs);
          sock.once('connect', () => finish(true));
          sock.once('timeout', () => finish(false));
          sock.once('error', () => finish(false));
        }),
    ),
  ).then((r) => r.filter(Boolean));
}

// 通过指定 IP 向 github.com 发 HTTPS 请求(servername/Host 固定 github.com)
function httpsRequestViaIp(ip, { method, path, headers, body }, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: 'github.com', // TLS SNI —— 证书仍按 github.com 校验
        port: 443,
        method,
        path,
        headers: { Host: 'github.com', ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.once('timeout', () => req.destroy(new Error('timeout')));
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 多 IP 竞速换取 GitHub OAuth token。
 * @param {string} bodyStr application/x-www-form-urlencoded 的请求体(含 client_id/secret/code)
 * @returns {Promise<object>} GitHub 返回的 token JSON(含 access_token)
 */
export async function fetchGitHubTokenRacing(bodyStr) {
  const reachable = await probeReachableIps(GITHUB_HOST_IPS);
  if (!reachable.length) {
    throw new Error('Request timed out'); // 全部 IP 当下不可达(与旧文案保持一致,便于上层识别)
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(bodyStr),
    'User-Agent': 'light-note',
  };

  let lastErr;
  for (const ip of reachable) {
    try {
      const { status, body } = await httpsRequestViaIp(
        ip,
        { method: 'POST', path: '/login/oauth/access_token', headers, body: bodyStr },
        6000,
      );
      const data = JSON.parse(body);
      if (status === 200 && data.access_token) return data;
      // 已收到 GitHub 响应但无 token(code 无效/已用):code 一次性,换 IP 也无意义,直接失败
      throw new Error(`GitHub token 交换失败: ${status} ${data.error_description || data.error || body.slice(0, 120)}`);
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes('token 交换失败')) throw e; // 请求已到达 GitHub,不再换 IP
      console.warn(`[GitHub] token via ${ip} 失败: ${e.message}`); // TCP/超时 → 换下一个可达 IP
    }
  }
  throw lastErr || new Error('Request timed out');
}
