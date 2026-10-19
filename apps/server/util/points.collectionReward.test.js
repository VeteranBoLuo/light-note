import { expect, it } from 'vitest';
import { enrichPointsLogRow } from './points.js';
it('调研积分保留公开名称快照，不透出发放引用及内部元数据', () => {
  const row = enrichPointsLogRow({
    reason: 'campaign',
    ref: 'collection-form:abc',
    meta: JSON.stringify({ formTitle: '你从哪里了解到轻笺', accountId: 'private', requestId: 'private' }),
  });
  expect(row.sourceName).toEqual({ zh: '调研奖励 · 你从哪里了解到轻笺', en: 'Survey reward · 你从哪里了解到轻笺' });
  expect(row.meta).toBeNull();
  expect(row.ref).toBeNull();
  expect(row.sourceRef).toBeNull();
});
