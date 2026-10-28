import 'playwright-core';
import { getWebPageRendererRuntimeState, renderWebPage } from '../util/webPageRenderer.js';

const state = getWebPageRendererRuntimeState();
if (!state.enabled) {
  console.log('[web-renderer-check] disabled by WEB_PAGE_RENDERER_ENABLED');
  process.exit(0);
}
if (!state.executablePath) {
  console.error(
    '[web-renderer-check] Chrome/Chromium not found; install a system browser or set WEB_PAGE_RENDERER_EXECUTABLE_PATH',
  );
  process.exit(1);
}
if (typeof process.getuid === 'function' && process.getuid() === 0 && !state.identity.uid) {
  console.error('[web-renderer-check] root backend must configure a non-root renderer uid/gid');
  process.exit(1);
}
const probe = await renderWebPage('https://example.com/', { runtimeProbe: true, timeout: 10_000 });
if (!probe.ok || probe.uid === 0 || (state.identity.uid !== undefined && probe.uid !== state.identity.uid)) {
  console.error(
    '[web-renderer-check] low-privilege browser startup failed reason=%s stage=%s',
    probe.reason || 'INSECURE_IDENTITY',
    probe.stage || 'unknown',
  );
  process.exit(1);
}
console.log(
  '[web-renderer-check] ready executable=%s concurrency=%s%s',
  state.executablePath,
  state.limits.concurrency,
  state.identity.uid ? ` uid=${state.identity.uid} gid=${state.identity.gid}` : '',
);
