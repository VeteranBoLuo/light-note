import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FILE_PREVIEW_STRATEGY } from '@lightnote/shared';

const execFileAsync = promisify(execFile);
const runtimeCache = new Map();
const RUNTIME_CACHE_MS = 60_000;
const CHILD_ENV_ALLOWLIST = [
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'FONTCONFIG_PATH',
  'XDG_DATA_DIRS',
];

function enabled(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'disabled'].includes(String(value).trim().toLowerCase());
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

export function buildFilePreviewChildEnv(temporaryDirectory, env = process.env) {
  const childEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (env[key]) childEnv[key] = String(env[key]);
  }
  childEnv.TMPDIR = temporaryDirectory;
  childEnv.TMP = temporaryDirectory;
  childEnv.TEMP = temporaryDirectory;
  childEnv.SAL_USE_VCLPLUGIN = 'svp';
  return childEnv;
}

export function getFilePreviewRuntimeConfig(env = process.env) {
  return {
    archiveEnabled: enabled(env.FILE_PREVIEW_ARCHIVE_ENABLED),
    officeEnabled: enabled(env.FILE_PREVIEW_OFFICE_ENABLED),
    sevenZipBin: String(env.FILE_PREVIEW_7Z_BIN || '7zz').trim(),
    officeBin: String(env.FILE_PREVIEW_OFFICE_BIN || 'soffice').trim(),
    limits: {
      archiveMaxBytes: boundedInteger(env.FILE_PREVIEW_ARCHIVE_MAX_BYTES, 100 * 1024 * 1024, 1, 500 * 1024 * 1024),
      officeMaxBytes: boundedInteger(env.FILE_PREVIEW_OFFICE_MAX_BYTES, 50 * 1024 * 1024, 1, 200 * 1024 * 1024),
      convertedPdfMaxBytes: boundedInteger(env.FILE_PREVIEW_PDF_MAX_BYTES, 80 * 1024 * 1024, 1, 300 * 1024 * 1024),
      archiveMaxEntries: boundedInteger(env.FILE_PREVIEW_ARCHIVE_MAX_ENTRIES, 10_000, 1, 50_000),
      archiveMaxPathLength: boundedInteger(env.FILE_PREVIEW_ARCHIVE_MAX_PATH_LENGTH, 1024, 64, 4096),
      archiveMaxListingBytes: boundedInteger(
        env.FILE_PREVIEW_ARCHIVE_MAX_LISTING_BYTES,
        6 * 1024 * 1024,
        128 * 1024,
        32 * 1024 * 1024,
      ),
      archiveMaxManifestBytes: boundedInteger(
        env.FILE_PREVIEW_ARCHIVE_MAX_MANIFEST_BYTES,
        4 * 1024 * 1024,
        128 * 1024,
        16 * 1024 * 1024,
      ),
      archiveTimeoutMs: boundedInteger(env.FILE_PREVIEW_ARCHIVE_TIMEOUT_MS, 45_000, 5_000, 180_000),
      officeTimeoutMs: boundedInteger(env.FILE_PREVIEW_OFFICE_TIMEOUT_MS, 120_000, 10_000, 300_000),
    },
  };
}

async function inspectBinary(bin, args, errorCode, runner) {
  try {
    await runner(bin, args, { timeout: 5_000, maxBuffer: 256 * 1024, windowsHide: true });
    return { ready: true, errorCode: '' };
  } catch {
    return { ready: false, errorCode };
  }
}

export async function inspectFilePreviewRuntime(
  strategy,
  { env = process.env, force = false, runner = execFileAsync } = {},
) {
  const config = getFilePreviewRuntimeConfig(env);
  const archive = strategy === FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST;
  const featureEnabled = archive ? config.archiveEnabled : config.officeEnabled;
  const bin = archive ? config.sevenZipBin : config.officeBin;
  const errorCode = archive ? 'ARCHIVE_RUNTIME_UNAVAILABLE' : 'OFFICE_RUNTIME_UNAVAILABLE';
  if (!featureEnabled) return { ready: false, errorCode: 'FILE_PREVIEW_DISABLED', bin, config };

  const key = `${strategy}:${bin}`;
  const cached = runtimeCache.get(key);
  if (!force && cached && Date.now() - cached.checkedAt < RUNTIME_CACHE_MS) {
    return { ...cached.result, bin, config };
  }
  const result = await inspectBinary(bin, archive ? ['i'] : ['--version'], errorCode, runner);
  runtimeCache.set(key, { checkedAt: Date.now(), result });
  return { ...result, bin, config };
}

export async function inspectAllFilePreviewRuntimes(options = {}) {
  const [archive, office] = await Promise.all([
    inspectFilePreviewRuntime(FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST, options),
    inspectFilePreviewRuntime(FILE_PREVIEW_STRATEGY.CONVERTED_PDF, options),
  ]);
  return { archive, office, ready: archive.ready && office.ready };
}
