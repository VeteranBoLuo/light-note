import { inspectLocalOcrRuntime } from '../util/aiDocument/localOcr.js';

const result = await inspectLocalOcrRuntime();

if (!result.ready) {
  const detail = result.missingLanguages?.length
    ? `缺少语言模型: ${result.missingLanguages.join(', ')}`
    : `运行环境错误: ${result.errorCode || 'OCR_ENGINE_UNAVAILABLE'}`;
  console.error(`[OCR 检查] 未就绪，${detail}`);
  process.exitCode = 1;
} else {
  console.log(`[OCR 检查] 本地 OCR 已就绪，语言: ${result.languages.join('+')}`);
}
