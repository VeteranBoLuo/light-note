import path from 'node:path';

// 本机沙箱是一套明确的独立依赖，不能借用远程写入豁免启动。
export function assertLocalTestEnvironment(env) {
  const fail = () => { throw Object.assign(new Error('LOCAL_TEST_ENVIRONMENT_UNSAFE'), { code: 'LOCAL_TEST_ENVIRONMENT_UNSAFE' }); };
  if (env.LIGHTNOTE_RUNTIME_ENV !== 'local' || env.NODE_ENV === 'production' || env.LIGHTNOTE_DATABASE_SCOPE !== 'local') fail();
  if (env.ALLOW_REMOTE_DATABASE_WRITES !== 'false' || env.ALLOW_REMOTE_DATABASE_READS !== 'false') fail();
  if (env.DB_HOST !== '127.0.0.1' || String(env.DB_PORT) !== '13306' || env.DB_NAME !== 'lightnote_local' || env.DB_USER !== 'lightnote_local') fail();
  for (const [value, port, protocol] of [[env.REDIS_URL, '16379', 'redis:'], [env.OBS_ENDPOINT, '19002', 'http:']]) {
    let parsed;
    try { parsed = new URL(value); } catch { fail(); }
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== port || parsed.protocol !== protocol) fail();
  }
  if (env.SMTP_HOST !== '127.0.0.1' || String(env.SMTP_PORT) !== '11025') fail();
  if (env.FAVICON_API_BASE_URL !== 'http://127.0.0.1:19003/') fail();
  if (env.SITE_URL !== 'http://localhost:15173' || env.OBS_BUCKET_NAME !== 'lightnote-local') fail();
  for (const key of ['BROWSER_PUSH_ENABLED', 'HUAWEI_PUSH_ENABLED', 'SUPPORT_PACKAGES_CHECKOUT_ENABLED', 'SEO_PUSH_ENABLED']) {
    if (env[key] !== 'false') fail();
  }
  const root = path.resolve(env.LIGHTNOTE_LOCAL_TEST_DIR || '');
  if (path.basename(root) !== '.local-test' || !env.LIGHTNOTE_LOCAL_TEST_DIR) fail();
  for (const key of ['LIGHT_NOTE_IMAGE_DIR', 'BOOKMARK_ICON_UPLOAD_DIR', 'NOTE_IMAGE_THUMBNAIL_DIR', 'DRAWING_THUMBNAIL_DIR', 'DATA_EXPORT_STORAGE_DIR']) {
    if (!env[key] || !path.resolve(env[key]).startsWith(root + path.sep)) fail();
  }
  return true;
}
