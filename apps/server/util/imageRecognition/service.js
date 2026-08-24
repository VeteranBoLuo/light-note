import { stableAgentErrorCode } from '../agent/logSafety.js';
import { localOcrProvider } from '../aiDocument/localOcr.js';
import { getActiveAiExecution } from '../aiExecution/context.js';
import { createVisionCircuitBreaker } from './circuitBreaker.js';
import { deepseekVisionProvider, DEFAULT_DEEPSEEK_VISION_MODEL } from './deepseekVisionProvider.js';
import { inspectRecognitionText } from './quality.js';

export const IMAGE_RECOGNITION_POLICY_VERSION = 2;

const INPUT_ERRORS = new Set([
  'FILE_CONTENT_INVALID',
  'FILE_SIZE_INVALID',
  'OCR_IMAGE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
]);

const CIRCUIT_FAILURES = new Set([
  'AI_GATEWAY_TIMEOUT',
  'AI_TIMEOUT',
  'AI_FIRST_TOKEN_TIMEOUT',
  'AI_NETWORK_ERROR',
  'AI_RATE_LIMITED',
  'AI_PROVIDER_AUTH_FAILED',
  'AI_PROVIDER_ERROR',
  'AI_PROVIDER_MODEL_UNAVAILABLE',
  'AI_PROVIDER_REQUEST_INVALID',
  'VISION_NO_TEXT',
  'VISION_OUTPUT_INVALID',
  'VISION_OUTPUT_LOW_QUALITY',
]);

function recognitionMode(env = process.env) {
  const raw = String(env.AI_IMAGE_RECOGNITION_MODE || 'vision_primary')
    .trim()
    .toLowerCase();
  if (['local', 'local_only', 'ocr'].includes(raw)) return 'local_only';
  // shadow 需要独立的平台评测执行，不能在真实用户动作里暗扣一次视觉模型额度。
  if (['vision_shadow', 'shadow'].includes(raw)) return 'local_only';
  if (raw === 'vision_primary') return 'vision_primary';
  // 配置拼写错误时宁可少一次高精度识别，也不能意外把用户图片外发给模型。
  return 'local_only';
}

function aborted(error, signal) {
  return Boolean(signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR');
}

function normalizedLocalResult(result, { fallbackReason = '', mode, now = Date.now() } = {}) {
  const quality = inspectRecognitionText(result?.content);
  if (!quality.text) {
    const error = new Error('本地 OCR 没有识别到可读文字');
    error.code = 'EMPTY_DOCUMENT';
    throw error;
  }
  const supplied = result?.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  const retryableFallback = Boolean(
    fallbackReason && fallbackReason !== 'AI_EXECUTION_REQUIRED' && mode !== 'local_only',
  );
  return {
    content: quality.text,
    metadata: {
      ...supplied,
      engine: 'local_ocr',
      provider: null,
      model: null,
      policyVersion: IMAGE_RECOGNITION_POLICY_VERSION,
      mode,
      fallbackReason: fallbackReason || null,
      retryAfter: retryableFallback ? new Date(now + 30 * 60_000).toISOString() : null,
      quality: {
        ...(supplied.quality || {}),
        status: quality.suspicious ? 'degraded' : supplied.quality?.status || 'accepted',
        meaningfulRatio: quality.meaningfulRatio,
        chars: quality.chars,
      },
      warnings: [...new Set([...(supplied.warnings || []), ...(fallbackReason ? ['VISION_FALLBACK_USED'] : [])])],
    },
  };
}

function normalizedVisionResult(result, mode) {
  return {
    content: String(result?.content || '').trim(),
    metadata: {
      ...(result?.metadata || {}),
      engine: 'deepseek_vision',
      policyVersion: IMAGE_RECOGNITION_POLICY_VERSION,
      mode,
      fallbackReason: null,
      retryAfter: null,
    },
  };
}

export function createImageRecognitionProvider({
  visionProvider = deepseekVisionProvider,
  localProvider = localOcrProvider,
  circuitBreaker = createVisionCircuitBreaker(),
  env = process.env,
  now = () => Date.now(),
  hasExecution = () => Boolean(getActiveAiExecution()),
} = {}) {
  return Object.freeze({
    async recognizeImage(buffer, options = {}) {
      const mode = recognitionMode(env);
      const runLocal = async (fallbackReason = '') =>
        normalizedLocalResult(await localProvider.recognizeImage(buffer, options), {
          fallbackReason,
          mode,
          now: now(),
        });
      if (mode === 'local_only') return runLocal('');
      // 后台 Worker 的无模型解析继续走本地 OCR；只有用户明确动作建立 AI Execution 后才外发图片。
      if (!hasExecution()) return runLocal('AI_EXECUTION_REQUIRED');

      const circuitIdentity = `deepseek:${String(
        options.model || env.DEEPSEEK_VISION_MODEL || visionProvider.model || DEFAULT_DEEPSEEK_VISION_MODEL,
      )}`;
      const circuit = await circuitBreaker.isOpen(circuitIdentity);
      if (circuit.open) return runLocal(`VISION_CIRCUIT_OPEN_${circuit.reason || 'AI_PROVIDER_ERROR'}`);

      try {
        const result = await visionProvider.recognizeImage(buffer, options);
        await circuitBreaker.recordSuccess(circuitIdentity);
        return normalizedVisionResult(result, mode);
      } catch (error) {
        if (aborted(error, options.signal)) throw error;
        const code = stableAgentErrorCode(error);
        if (INPUT_ERRORS.has(code)) throw error;
        if (CIRCUIT_FAILURES.has(code)) await circuitBreaker.recordFailure(circuitIdentity, code);
        try {
          return await runLocal(code);
        } catch (localError) {
          if (aborted(localError, options.signal)) throw localError;
          if (code === 'VISION_NO_TEXT' && stableAgentErrorCode(localError) === 'EMPTY_DOCUMENT') {
            localError.code = 'EMPTY_DOCUMENT';
          }
          try {
            Object.defineProperty(localError, 'visionErrorCode', { value: code, configurable: true });
          } catch {
            // 冻结异常保持原样。
          }
          throw localError;
        }
      }
    },
  });
}

export const imageRecognitionProvider = createImageRecognitionProvider();

export function getImageRecognitionPolicy(env = process.env) {
  return Object.freeze({
    version: IMAGE_RECOGNITION_POLICY_VERSION,
    mode: recognitionMode(env),
    visionModel: String(env.DEEPSEEK_VISION_MODEL || DEFAULT_DEEPSEEK_VISION_MODEL).trim(),
  });
}

export const imageRecognitionServiceInternals = Object.freeze({
  CIRCUIT_FAILURES,
  INPUT_ERRORS,
  normalizedLocalResult,
  recognitionMode,
});
