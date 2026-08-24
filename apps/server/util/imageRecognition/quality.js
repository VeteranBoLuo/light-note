const MAX_RECOGNITION_CHARS = 300_000;

export function cleanRecognitionText(value) {
  return String(value || '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{4,}/gu, '\n\n\n')
    .trim()
    .slice(0, MAX_RECOGNITION_CHARS);
}

/**
 * 这里只做与语言无关的保守门禁，不把模型自报 confidence 当成真实准确率。
 * 分数用于本地 OCR 多版面结果择优；suspicious 只拦明显乱码，不判断具体字段真伪。
 */
export function inspectRecognitionText(value) {
  const text = cleanRecognitionText(value);
  const compact = text.replace(/\s/gu, '');
  const meaningful = compact.match(/[\p{L}\p{N}]/gu)?.length || 0;
  const replacements = compact.match(/[�]/gu)?.length || 0;
  const repeatedMatch = /(.)\1{11,}/u.exec(compact)?.[0] || '';
  const repeatedRun = Boolean(
    repeatedMatch &&
    (repeatedMatch.length / Math.max(1, compact.length) >= 0.6 || /^[\p{L}\p{N}]+$/u.test(repeatedMatch)),
  );
  const meaningfulRatio = compact.length ? meaningful / compact.length : 0;
  const lineCount = text ? text.split('\n').filter(Boolean).length : 0;
  const score = Math.max(0, meaningful * 2 + Math.min(40, lineCount * 3) - replacements * 20 - (repeatedRun ? 80 : 0));
  return Object.freeze({
    text,
    chars: text.length,
    meaningfulChars: meaningful,
    meaningfulRatio: Number(meaningfulRatio.toFixed(4)),
    lineCount,
    score,
    suspicious:
      !text ||
      meaningful === 0 ||
      replacements > Math.max(2, Math.floor(compact.length * 0.02)) ||
      repeatedRun ||
      (compact.length >= 12 && meaningfulRatio < 0.24),
  });
}

export function chooseBetterRecognitionText(...values) {
  const inspected = values.map(inspectRecognitionText).filter((item) => item.text);
  inspected.sort((left, right) => {
    if (left.suspicious !== right.suspicious) return left.suspicious ? 1 : -1;
    return right.score - left.score || right.chars - left.chars;
  });
  return inspected[0] || inspectRecognitionText('');
}

export const imageRecognitionQualityInternals = Object.freeze({ MAX_RECOGNITION_CHARS });
