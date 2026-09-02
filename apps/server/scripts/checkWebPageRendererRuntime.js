import 'playwright-core';
import { getWebPageRendererRuntimeState } from '../util/webPageRenderer.js';

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
console.log(
  '[web-renderer-check] ready executable=%s concurrency=%s%s',
  state.executablePath,
  state.limits.concurrency,
  state.identity.uid ? ` uid=${state.identity.uid} gid=${state.identity.gid}` : '',
);
