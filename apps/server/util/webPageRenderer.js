/**
 * 通用网页浏览器渲染兜底的父进程边界。
 *
 * 每次任务都使用短生命周期子进程；子进程不继承后端密钥环境，后端若以 root 运行则
 * 强制降权。并发与等待队列都有硬上限，停止请求时终止整个进程组，避免遗留 Chromium。
 */

import { accessSync, constants as fsConstants, existsSync } from 'node:fs';
import { chown, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePublicWebUrl } from './webUrlSafety.js';

const RUNNER_PATH = fileURLToPath(new URL('./webPageRendererRunner.js', import.meta.url));
const DEFAULT_TIMEOUT_MS = 18_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_QUEUE_LIMIT = 6;
const DEFAULT_QUEUE_TIMEOUT_MS = 5_000;

let activeRenderers = 0;
const rendererQueue = [];

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function enabledByEnvironment() {
  return !['0', 'false', 'off', 'disabled'].includes(
    String(process.env.WEB_PAGE_RENDERER_ENABLED || 'true').toLowerCase(),
  );
}

function executable(pathname) {
  if (!pathname) return false;
  try {
    accessSync(pathname, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableFromPath(name) {
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(directory, name);
    if (executable(candidate)) return candidate;
  }
  return '';
}

export function resolveWebRendererExecutable() {
  const configured = String(process.env.WEB_PAGE_RENDERER_EXECUTABLE_PATH || '').trim();
  if (configured) return executable(configured) ? configured : '';
  const absoluteCandidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  for (const candidate of absoluteCandidates) {
    if (executable(candidate)) return candidate;
  }
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
    const candidate = executableFromPath(name);
    if (candidate) return candidate;
  }
  return '';
}

function rendererIdentity() {
  const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
  const currentGid = typeof process.getgid === 'function' ? process.getgid() : null;
  if (currentUid !== 0) return { uid: undefined, gid: undefined };
  const uid = boundedInteger(process.env.WEB_PAGE_RENDERER_UID, 65534, 1, 2_147_483_647);
  const gid = boundedInteger(process.env.WEB_PAGE_RENDERER_GID, 65534, 1, 2_147_483_647);
  return { uid, gid };
}

function rendererLimits() {
  return {
    concurrency: boundedInteger(process.env.WEB_PAGE_RENDERER_CONCURRENCY, DEFAULT_CONCURRENCY, 1, 4),
    queueLimit: boundedInteger(process.env.WEB_PAGE_RENDERER_QUEUE_LIMIT, DEFAULT_QUEUE_LIMIT, 0, 30),
    queueTimeout: boundedInteger(process.env.WEB_PAGE_RENDERER_QUEUE_TIMEOUT_MS, DEFAULT_QUEUE_TIMEOUT_MS, 100, 20_000),
  };
}

function abortError() {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
}

function releaseRendererSlot() {
  activeRenderers = Math.max(0, activeRenderers - 1);
  while (rendererQueue.length) {
    const waiter = rendererQueue.shift();
    if (waiter.done || waiter.signal?.aborted) continue;
    waiter.done = true;
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    activeRenderers += 1;
    waiter.resolve(releaseRendererSlot);
    break;
  }
}

async function acquireRendererSlot(signal) {
  const limits = rendererLimits();
  if (activeRenderers < limits.concurrency) {
    activeRenderers += 1;
    return releaseRendererSlot;
  }
  if (rendererQueue.length >= limits.queueLimit) return null;
  if (signal?.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject, signal, done: false, timer: null, onAbort: null };
    const finishWithoutSlot = (error) => {
      if (waiter.done) return;
      waiter.done = true;
      clearTimeout(waiter.timer);
      const index = rendererQueue.indexOf(waiter);
      if (index >= 0) rendererQueue.splice(index, 1);
      signal?.removeEventListener('abort', waiter.onAbort);
      if (error) reject(error);
      else resolve(null);
    };
    waiter.onAbort = () => finishWithoutSlot(abortError());
    waiter.timer = setTimeout(() => finishWithoutSlot(null), limits.queueTimeout);
    waiter.timer.unref?.();
    signal?.addEventListener('abort', waiter.onAbort, { once: true });
    rendererQueue.push(waiter);
  });
}

function terminateProcessGroup(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

function parseRunnerOutput(output) {
  try {
    const parsed = JSON.parse(String(output || ''));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizedChildEnvironment(home) {
  return {
    PATH: String(process.env.PATH || '/usr/bin:/bin'),
    HOME: home,
    TMPDIR: home,
    LANG: String(process.env.LANG || 'C.UTF-8'),
    LC_ALL: String(process.env.LC_ALL || ''),
    NODE_ENV: 'production',
  };
}

export async function renderWebPage(
  rawUrl,
  { signal, timeout = DEFAULT_TIMEOUT_MS, bodyLimit = 2_000, maxRequests = 80, profile = 'desktop' } = {},
) {
  if (signal?.aborted) throw abortError();
  if (!enabledByEnvironment()) return { ok: false, reason: 'RENDERER_DISABLED' };
  let target;
  try {
    target = validatePublicWebUrl(rawUrl, { allowedPorts: [80, 443], defaultPortsOnly: true });
  } catch (error) {
    return { ok: false, reason: String(error?.code || 'INVALID_URL') };
  }
  const executablePath = resolveWebRendererExecutable();
  if (!executablePath) return { ok: false, reason: 'RENDERER_UNAVAILABLE' };
  const release = await acquireRendererSlot(signal);
  if (!release) return { ok: false, reason: 'RENDERER_BUSY' };

  const identity = rendererIdentity();
  const renderTimeout = boundedInteger(timeout, DEFAULT_TIMEOUT_MS, 3_000, MAX_TIMEOUT_MS);
  let temporaryHome = '';
  let child;
  try {
    temporaryHome = await mkdtemp(path.join(os.tmpdir(), 'light-note-web-render-'));
    if (identity.uid !== undefined) await chown(temporaryHome, identity.uid, identity.gid);
    child = spawn(process.execPath, [RUNNER_PATH], {
      cwd: path.dirname(RUNNER_PATH),
      detached: process.platform !== 'win32',
      env: sanitizedChildEnvironment(temporaryHome),
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(identity.uid !== undefined ? identity : {}),
    });

    const result = await new Promise((resolve, reject) => {
      let output = '';
      let stderr = '';
      let outputTooLarge = false;
      let completed = false;
      const finish = (value, error) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(value);
      };
      const stopChild = () => {
        terminateProcessGroup(child, 'SIGTERM');
        const forceTimer = setTimeout(() => terminateProcessGroup(child, 'SIGKILL'), 1_000);
        forceTimer.unref?.();
      };
      const onAbort = () => {
        stopChild();
        finish(null, abortError());
      };
      const timeoutId = setTimeout(() => {
        stopChild();
        finish({ ok: false, reason: 'RENDER_TIMEOUT' });
      }, renderTimeout + 2_000);
      timeoutId.unref?.();
      signal?.addEventListener('abort', onAbort, { once: true });
      child.once('error', (error) =>
        finish({ ok: false, reason: 'RENDERER_FAILED', stage: 'spawn', childCode: String(error?.code || '') }),
      );
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 8_000) stderr += chunk.toString('utf8').slice(0, 8_000 - stderr.length);
      });
      child.stdout.on('data', (chunk) => {
        if (outputTooLarge) return;
        output += chunk.toString('utf8');
        if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) {
          outputTooLarge = true;
          output = '';
          stopChild();
        }
      });
      child.once('close', (code, childSignal) => {
        if (outputTooLarge) return finish({ ok: false, reason: 'RENDER_OUTPUT_TOO_LARGE' });
        const parsed = parseRunnerOutput(output);
        finish(
          parsed || {
            ok: false,
            reason: 'RENDERER_FAILED',
            stage: /sandbox/iu.test(stderr) ? 'browser_sandbox' : 'child_exit',
            childCode: Number.isInteger(code) ? code : null,
            childSignal: childSignal || '',
            ...(process.env.WEB_PAGE_RENDERER_DIAGNOSTICS === '1'
              ? { diagnostic: stderr.replace(/https?:\/\/\S+/giu, '[url]').slice(0, 2_000) }
              : {}),
          },
        );
      });
      child.stdin.on('error', () => {});
      child.stdin.end(
        JSON.stringify({
          url: target.href,
          executablePath,
          timeout: renderTimeout,
          bodyLimit: boundedInteger(bodyLimit, 2_000, 0, 250_000),
          maxRequests: boundedInteger(maxRequests, 80, 10, 150),
          profile: profile === 'mobile' ? 'mobile' : 'desktop',
          diagnostics: process.env.WEB_PAGE_RENDERER_DIAGNOSTICS === '1',
        }),
      );
    });
    return result;
  } finally {
    terminateProcessGroup(child, 'SIGTERM');
    if (temporaryHome && existsSync(temporaryHome)) {
      await rm(temporaryHome, { recursive: true, force: true }).catch(() => {});
    }
    release();
  }
}

export function getWebPageRendererRuntimeState() {
  return Object.freeze({
    enabled: enabledByEnvironment(),
    executablePath: resolveWebRendererExecutable(),
    identity: rendererIdentity(),
    limits: rendererLimits(),
  });
}

export const webPageRendererInternals = Object.freeze({
  abortError,
  parseRunnerOutput,
  rendererIdentity,
  sanitizedChildEnvironment,
});
