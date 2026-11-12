import { describe, expect, it } from 'vitest';
import { localTestPorts } from './localTestPorts.js';
import { assertLocalTestEnvironment } from './localTestEnvironment.js';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { isManagedUploadOrigin, uploadOrigin } from './uploadOrigin.js';

const safe = {
  LIGHTNOTE_LOCAL_TEST: '1', NODE_ENV: 'development', LIGHTNOTE_RUNTIME_ENV: 'local', LIGHTNOTE_DATABASE_SCOPE: 'local',
  ALLOW_REMOTE_DATABASE_WRITES: 'false', ALLOW_REMOTE_DATABASE_READS: 'false',
  DB_HOST: '127.0.0.1', DB_PORT: '13306', DB_NAME: 'lightnote_local', DB_USER: 'lightnote_local',
  REDIS_URL: 'redis://127.0.0.1:16379', OBS_ENDPOINT: 'http://127.0.0.1:19002', OBS_BUCKET_NAME: 'lightnote-local',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '11025', SITE_URL: 'http://localhost:15173',
  FAVICON_API_BASE_URL: 'http://127.0.0.1:19003/',
  BROWSER_PUSH_ENABLED: 'false', HUAWEI_PUSH_ENABLED: 'false', SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'false', SEO_PUSH_ENABLED: 'false',
  LIGHTNOTE_LOCAL_TEST_DIR: '/project/.local-test', LIGHT_NOTE_IMAGE_DIR: '/project/.local-test/uploads',
  BOOKMARK_ICON_UPLOAD_DIR: '/project/.local-test/uploads', NOTE_IMAGE_THUMBNAIL_DIR: '/project/.local-test/thumbnails', DATA_EXPORT_STORAGE_DIR: '/project/.local-test/exports',
  DRAWING_THUMBNAIL_DIR: '/project/.local-test/drawing',
};
describe('independent local environment', () => {
  it('accepts a consistent independent worktree offset and rejects mixed or invalid profiles', () => {
    const ports = localTestPorts({ LIGHTNOTE_LOCAL_PORT_OFFSET: '1000' });
    const isolated = { ...safe, LIGHTNOTE_LOCAL_PORT_OFFSET: '1000', DB_PORT: String(ports.mysql),
      REDIS_URL: `redis://127.0.0.1:${ports.redis}`, OBS_ENDPOINT: `http://127.0.0.1:${ports.storage}`,
      SMTP_PORT: String(ports.smtp), SITE_URL: `http://localhost:${ports.web}`, FAVICON_API_BASE_URL: `http://127.0.0.1:${ports.favicon}/` };
    expect(assertLocalTestEnvironment(isolated)).toBe(true);
    expect(() => assertLocalTestEnvironment({ ...isolated, DB_PORT: '13306' })).toThrow('LOCAL_TEST_ENVIRONMENT_UNSAFE');
    for (const offset of ['-1', '0.5', '20001', 'localhost']) expect(() => localTestPorts({ LIGHTNOTE_LOCAL_PORT_OFFSET: offset })).toThrow('LOCAL_TEST_PORT_OFFSET_INVALID');
    expect(uploadOrigin(isolated)).toBe('http://localhost:16173');
  });
  it('enables background notifications only after every dependency passes isolation checks', () => {
    expect(assertLocalTestEnvironment(safe)).toBe(true);
    expect(notificationSchedulerEnabled(safe)).toBe(true);
    expect(notificationSchedulerEnabled({ LIGHTNOTE_RUNTIME_ENV: 'local' })).toBe(false);
  });
  it.each([
    ['LIGHTNOTE_DATABASE_SCOPE', 'remote'], ['DB_HOST', 'database.example.com'], ['DB_PORT', '3307'], ['DB_NAME', 'tag_db'],
    ['ALLOW_REMOTE_DATABASE_WRITES', 'true'], ['ALLOW_REMOTE_DATABASE_READS', 'true'],
    ['REDIS_URL', 'redis://127.0.0.1:6379'], ['OBS_ENDPOINT', 'https://storage.example.com'],
    ['SMTP_HOST', 'smtp.example.com'], ['BROWSER_PUSH_ENABLED', 'true'], ['HUAWEI_PUSH_ENABLED', 'true'],
    ['LIGHT_NOTE_IMAGE_DIR', '/project/.local-test-other/uploads'], ['NODE_ENV', 'production'],
  ])('refuses unsafe %s before a scheduler can consume work', (key, value) => {
    expect(() => notificationSchedulerEnabled({ ...safe, [key]: value })).toThrow('LOCAL_TEST_ENVIRONMENT_UNSAFE');
  });
  it('preserves production image origins and allows only the fixed local entry in the sandbox', () => {
    expect(uploadOrigin({})).toBe('https://boluo66.top');
    expect(uploadOrigin(safe)).toBe('http://localhost:15173');
    expect(isManagedUploadOrigin('http://localhost:15173', {})).toBe(false);
    expect(isManagedUploadOrigin('http://localhost:15173', safe)).toBe(true);
    expect(isManagedUploadOrigin('http://localhost:15174', safe)).toBe(false);
    expect(isManagedUploadOrigin('https://untrusted.example', safe)).toBe(false);
  });
});
