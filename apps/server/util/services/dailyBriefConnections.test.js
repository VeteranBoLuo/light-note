import { describe, it, expect, vi } from 'vitest';
import { buildBriefConnectionQuery, compileBriefConnection } from './dailyBriefConnections.js';
import { briefSnapshot } from './dailyBriefFreshness.js';
const calendar = {
  date: '2026-09-05',
  todayStart: '2026-09-05 00:00:00',
  todayEnd: '2026-09-06 00:00:00',
  yesterdayStart: '2026-09-04 00:00:00',
  locale: 'zh-CN',
};
const recent = { type: 'note', id: 'new', title: '智能改造 2026', tagId: 'tag', tagName: '装修' };
const older = { type: 'file', id: 'old', title: '水电方案', tagId: 'tag', tagName: '装修' };

describe('简报新旧关联', () => {
  it('近期与旧资料查询均限定资源、标签、关系的当前账号，且有界、只读、参数化', () => {
    for (const tags of [null, ['tag', "' OR 1=1"]]) {
      const { sql, params } = buildBriefConnectionQuery('owner', calendar, tags);
      expect(sql.replace(/'[^']*'/g, '').match(/\?/g)).toHaveLength(params.length);
      expect(sql.match(/relation.user_id = \?/g)).toHaveLength(3);
      expect(sql.match(/owned_tag.user_id = \?/g)).toHaveLength(3);
      expect(sql.match(/LIMIT 24/g)).toHaveLength(4);
      expect(sql).toContain('utf8mb4_unicode_ci');
      expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|content|body|OR 1=1/);
      if (tags) expect(sql).toContain('INTERVAL 30 DAY');
      else expect(params).toContain(calendar.yesterdayStart);
    }
  });
  it('没有近期有效标签时不查询旧资料，也不编造关联', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    expect(await compileBriefConnection(db, 'owner', calendar)).toMatchObject({ count: 0, sources: [], samples: [] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('仅共同标签生成带两项真实来源的证据，变化进入现有新鲜度快照', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[recent]])
        .mockResolvedValueOnce([[older]]),
    };
    const fact = await compileBriefConnection(db, 'owner', calendar);
    expect(fact).toMatchObject({
      count: 1,
      tagName: '装修',
      sources: [
        { type: 'note', id: 'new' },
        { type: 'file', id: 'old' },
      ],
    });
    expect(fact.samples[0]).toContain('同属「装修」标签');
    expect(briefSnapshot([fact], calendar, 'now').fingerprint).not.toBe(
      briefSnapshot([{ ...fact, sources: [] }], calendar, 'now').fingerprint,
    );
  });
  it('不同标签、同一资源、危险链接不充当旧资料', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[recent]])
        .mockResolvedValueOnce([
          [recent, { ...older, tagId: 'other' }, { ...older, type: 'bookmark', url: 'javascript:alert(1)' }],
        ]),
    };
    expect(await compileBriefConnection(db, 'owner', calendar)).toMatchObject({ count: 0 });
  });
});
