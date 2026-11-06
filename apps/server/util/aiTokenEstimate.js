// 不保存正文；按字符类型估算。候选策略需经固定样本与真实 usage 校准后才启用。
export function reservationCalibrationEnabled(env = process.env) {
  return env.AI_RESERVATION_CALIBRATION_MODE === 'v2';
}
export function estimateTypedTextTokens(value) {
  let asciiLetters = 0,
    spaces = 0,
    tokens = 0;
  for (const char of String(value || '')) {
    if (/[A-Za-z]/.test(char)) asciiLetters++;
    else if (/\s/u.test(char)) spaces++;
    else if (/\p{Script=Han}/u.test(char)) tokens += 1.25;
    else if (char.codePointAt(0) > 0xffff) tokens += 3;
    else if (/[^\x00-\x7f]/.test(char)) tokens += 2;
    else tokens += 1; // 数字与代码标点不按英文单词压缩，避免低估。
  }
  return Math.ceil(tokens + asciiLetters / 3 + spaces / 4);
}
export function calibratedNoteOutputTokens(input = {}) {
  const fixed = { title: 256, summarize: 2048, outline: 2048 };
  if (fixed[input.operation]) return fixed[input.operation];
  const scale = input.operation === 'expand' ? 1.8 : 1.15;
  const textBudget = estimateTypedTextTokens(input.text) * scale;
  const minimum = Number(input.targetLength || 0) * 1.5;
  return Math.min(32768, Math.max(1024, Math.ceil(Math.max(textBudget, minimum) / 256) * 256));
}
