import { describe, expect, it, vi } from 'vitest';
import { FILE_PREVIEW_STRATEGY } from '@lightnote/shared';
import { buildFilePreviewChildEnv, getFilePreviewRuntimeConfig, inspectFilePreviewRuntime } from './runtime.js';

describe('file preview runtime checks', () => {
  it('honors kill switches and bounded resource settings', async () => {
    const env = {
      FILE_PREVIEW_ARCHIVE_ENABLED: 'false',
      FILE_PREVIEW_ARCHIVE_MAX_ENTRIES: '999999',
    };
    const config = getFilePreviewRuntimeConfig(env);
    expect(config.archiveEnabled).toBe(false);
    expect(config.limits.archiveMaxEntries).toBe(50_000);
    await expect(
      inspectFilePreviewRuntime(FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST, { env, force: true }),
    ).resolves.toMatchObject({ ready: false, errorCode: 'FILE_PREVIEW_DISABLED' });
  });

  it('uses explicit binaries without invoking a shell', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: 'ok' });
    await expect(
      inspectFilePreviewRuntime(FILE_PREVIEW_STRATEGY.CONVERTED_PDF, {
        env: { FILE_PREVIEW_OFFICE_BIN: '/safe/soffice' },
        force: true,
        runner,
      }),
    ).resolves.toMatchObject({ ready: true, bin: '/safe/soffice' });
    expect(runner).toHaveBeenCalledWith('/safe/soffice', ['--version'], expect.objectContaining({ timeout: 5000 }));
  });

  it('does not expose application credentials to untrusted converter processes', () => {
    const childEnv = buildFilePreviewChildEnv('/private/preview', {
      PATH: '/usr/bin',
      LANG: 'zh_CN.UTF-8',
      OBS_SK: 'secret',
      DATABASE_URL: 'mysql://secret',
      REDIS_URL: 'redis://secret',
    });

    expect(childEnv).toMatchObject({
      PATH: '/usr/bin',
      LANG: 'zh_CN.UTF-8',
      TMPDIR: '/private/preview',
      TMP: '/private/preview',
      TEMP: '/private/preview',
      SAL_USE_VCLPLUGIN: 'svp',
    });
    expect(childEnv).not.toHaveProperty('OBS_SK');
    expect(childEnv).not.toHaveProperty('DATABASE_URL');
    expect(childEnv).not.toHaveProperty('REDIS_URL');
  });
});
