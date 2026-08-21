import { describe, expect, it } from 'vitest';
import { isAgentUuid, normalizeAgentUuid } from './identifiers.js';

describe('agent identifiers', () => {
  it('只接受标准 UUID 并统一为小写', () => {
    expect(normalizeAgentUuid(' 550E8400-E29B-41D4-A716-446655440000 ')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(isAgentUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it.each(['', 'not-a-uuid', '------------------------------------', '550e8400-e29b-01d4-a716-446655440000'])(
    '拒绝非标准值 %s',
    (value) => {
      expect(normalizeAgentUuid(value)).toBe('');
      expect(isAgentUuid(value)).toBe(false);
    },
  );
});
