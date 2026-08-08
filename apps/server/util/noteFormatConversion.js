import crypto from 'node:crypto';

const HASH_PATTERN = /^(sha256:[a-f0-9]{64}|fnv1a32:[a-f0-9]{8})$/u;

export function serializeNoteFormatConversionHashInput({ targetType, convertedContent, baseRevision }) {
  return JSON.stringify({
    version: 1,
    targetType,
    baseRevision: Math.max(1, Number(baseRevision || 1)),
    convertedContent: String(convertedContent || ''),
  });
}

function fnv1a32(buffer) {
  let hash = 0x811c9dc5;
  for (const value of buffer) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildNoteFormatConversionAnalysisHash(input, algorithm = 'sha256') {
  const serialized = serializeNoteFormatConversionHashInput(input);
  if (algorithm === 'fnv1a32') return `fnv1a32:${fnv1a32(Buffer.from(serialized, 'utf8'))}`;
  return `sha256:${crypto.createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function isValidNoteFormatConversionAnalysisHash(value) {
  return HASH_PATTERN.test(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

export function verifyNoteFormatConversionAnalysisHash(value, input) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!isValidNoteFormatConversionAnalysisHash(normalized)) return false;
  const algorithm = normalized.startsWith('fnv1a32:') ? 'fnv1a32' : 'sha256';
  const expected = buildNoteFormatConversionAnalysisHash(input, algorithm);
  const actualBuffer = Buffer.from(normalized, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
