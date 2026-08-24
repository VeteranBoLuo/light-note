import { inspectLocalOcrRuntime } from '../util/aiDocument/localOcr.js';

const result = await inspectLocalOcrRuntime();

if (!result.ready) {
  const details = [];
  if (result.missingComponents?.length) {
    details.push(`缺少组件: ${result.missingComponents.join(', ')}`);
  }
  if (result.missingLanguages?.length) {
    details.push(`缺少语言模型: ${result.missingLanguages.join(', ')}`);
  }
  if (!details.length) details.push(`运行环境错误: ${result.errorCode || 'OCR_ENGINE_UNAVAILABLE'}`);
  console.error(`[OCR 检查] 未就绪，${details.join('；')}`);
  process.exitCode = 1;
} else {
  const preprocess = result.preprocessEnabled ? '，ImageMagick 预处理已就绪' : '，图片预处理已关闭';
  console.log(`[OCR 检查] 本地 OCR 已就绪，语言: ${result.languages.join('+')}${preprocess}`);
}
