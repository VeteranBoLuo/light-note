const LOCAL_RUNTIME_ALIASES = new Set(['local', 'development', 'dev']);
const PRODUCTION_RUNTIME_ALIASES = new Set(['production', 'prod']);

function safetyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function explicitTrue(value) {
  return (
    value === true ||
    String(value || '')
      .trim()
      .toLowerCase() === 'true' ||
    String(value || '').trim() === '1'
  );
}

export function resolveLightNoteRuntime(env = process.env) {
  const explicit = String(env.LIGHTNOTE_RUNTIME_ENV || '')
    .trim()
    .toLowerCase();
  if (explicit) {
    if (LOCAL_RUNTIME_ALIASES.has(explicit)) return { runtime: 'local', source: 'LIGHTNOTE_RUNTIME_ENV' };
    if (PRODUCTION_RUNTIME_ALIASES.has(explicit)) return { runtime: 'production', source: 'LIGHTNOTE_RUNTIME_ENV' };
    if (explicit === 'test') return { runtime: 'test', source: 'LIGHTNOTE_RUNTIME_ENV' };
    throw safetyError('DATABASE_RUNTIME_ENV_INVALID', 'LIGHTNOTE_RUNTIME_ENV 只允许 local、production 或 test');
  }

  const nodeEnv = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'test') return { runtime: 'test', source: 'NODE_ENV' };
  if (nodeEnv === 'production') return { runtime: 'production', source: 'NODE_ENV' };
  if (nodeEnv === 'development') return { runtime: 'local', source: 'NODE_ENV' };

  // 未声明环境一律按本地处理；远程数据库因此失败关闭，生产不能靠操作系统猜测身份。
  return { runtime: 'local', source: 'safe_default' };
}

export function isLocalDatabaseHost(hostValue) {
  const host = String(hostValue || '127.0.0.1')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '');
  return (
    !host ||
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host.startsWith('/')
  );
}

export function assertDatabaseConnectionSafety(env = process.env) {
  const runtime = resolveLightNoteRuntime(env);
  const databaseScope = isLocalDatabaseHost(env.DB_HOST) ? 'local' : 'remote';
  const remoteWriteOverride = explicitTrue(env.ALLOW_REMOTE_DATABASE_WRITES);

  if (
    runtime.runtime !== 'production' &&
    runtime.runtime !== 'test' &&
    databaseScope === 'remote' &&
    !remoteWriteOverride
  ) {
    throw safetyError(
      'REMOTE_DATABASE_WRITE_BLOCKED',
      '本地运行时拒绝连接远程数据库；请改用本地数据库。确需远程写入时必须显式设置 ALLOW_REMOTE_DATABASE_WRITES=true',
    );
  }

  return Object.freeze({
    runtime: runtime.runtime,
    runtimeSource: runtime.source,
    databaseScope,
    remoteWriteOverride,
  });
}
