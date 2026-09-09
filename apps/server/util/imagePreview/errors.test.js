import { describe, it, expect } from 'vitest';
import { classifyImageError, imageFailure } from './errors.js';
describe('image errors retain stage and safe public meaning', () => {
  it.each([
    [{ code: 'ENOENT' }, 'source', 'IMAGE_SOURCE_MISSING'],
    [{ code: 'ENOENT' }, 'decode', 'IMAGE_RUNTIME_UNAVAILABLE'],
    [{ killed: true }, 'encode', 'IMAGE_PROCESS_TIMEOUT'],
    [{ code: 'ENOSPC' }, 'encode', 'IMAGE_RESOURCE_LIMIT'],
    [{ stderr: 'cache resources exhausted' }, 'decode', 'IMAGE_RESOURCE_LIMIT'],
    [{ stderr: 'improper image header' }, 'decode', 'IMAGE_DECODE_FAILED'],
    [{ code: 'ECONNRESET' }, 'upload', 'IMAGE_STORAGE_UNAVAILABLE'],
    [new Error('private provider details'), 'processing', 'IMAGE_PROCESSING_FAILED'],
  ])('classifies without leaking raw errors', (error, stage, expected) => {
    expect(classifyImageError(error, stage)).toBe(expected);
  });
  it('never offers blind retry for source and resource limitations', () => {
    expect(imageFailure('IMAGE_SOURCE_MISSING')).toMatchObject({ retryable: false, failureKind: 'source' });
    expect(imageFailure('IMAGE_RESOURCE_LIMIT')).toMatchObject({ retryable: false, failureKind: 'resource_limit' });
    expect(imageFailure('IMAGE_STORAGE_UNAVAILABLE')).toMatchObject({ retryable: true, failureKind: 'service' });
  });
});
