import { describe, expect, it } from 'vitest';
import {
  buildActiveTagsQuery,
  buildCandidatePoolQuery,
  dailyReviewBookmarkUrlCondition,
  resolveDailyReviewBookmarkUrl,
  selectDailyReviewCandidates,
} from './dailyReviewCandidateService.js';

const candidate = (resourceType, resourceId, reasonCode, reasonTagId = null) => ({
  resource_type: resourceType,
  resource_id: resourceId,
  title: `${resourceType}-${resourceId}`,
  url: resourceType === 'bookmark' ? `https://example.com/${resourceId}` : null,
  create_time: '2025-01-01 00:00:00',
  resource_date: '2025-01-01',
  reason_code: reasonCode,
  reason_tag_id: reasonTagId,
});

describe('daily review candidate service', () => {
  it('同一账号和日期不受候选输入顺序影响，并保持原因优先级与三种资源覆盖', () => {
    const input = {
      userId: 'user-1',
      date: '2026-09-01',
      onThisDay: [candidate('bookmark', 'b1', 'on_this_day')],
      activeTag: [candidate('note', 'n1', 'active_tag', 'tag-1')],
      buried: [candidate('file', '7', 'buried')],
    };
    const first = selectDailyReviewCandidates(input);
    const shuffled = selectDailyReviewCandidates({
      ...input,
      onThisDay: [...input.onThisDay].reverse(),
      activeTag: [...input.activeTag].reverse(),
      buried: [...input.buried].reverse(),
    });

    expect(first).toEqual(shuffled);
    expect(first.map((item) => item.reasonCode)).toEqual(['on_this_day', 'active_tag', 'buried']);
    expect(new Set(first.map((item) => item.resourceType))).toEqual(new Set(['bookmark', 'note', 'file']));
  });

  it('每日最多 3 条、同一资源不重复且单类型最多 2 条', () => {
    const selected = selectDailyReviewCandidates({
      userId: 'user-1',
      date: '2026-09-01',
      onThisDay: [
        candidate('bookmark', 'b1', 'on_this_day'),
        candidate('bookmark', 'b2', 'on_this_day'),
        candidate('bookmark', 'b3', 'on_this_day'),
      ],
      activeTag: [candidate('bookmark', 'b1', 'active_tag', 'tag-1')],
      buried: [candidate('note', 'n1', 'buried'), candidate('file', '9', 'buried')],
    });

    expect(selected).toHaveLength(3);
    expect(selected.filter((item) => item.resourceType === 'bookmark')).toHaveLength(2);
    expect(new Set(selected.map((item) => `${item.resourceType}:${item.resourceId}`)).size).toBe(3);
  });

  it('activeTagIds 规范化后为空时不生成 IN ()', () => {
    expect(
      buildCandidatePoolQuery({
        userId: 'user-1',
        date: '2026-09-01',
        reasonCode: 'active_tag',
        activeTagIds: ['', '  ', null],
      }),
    ).toBeNull();
  });

  it('每个资源类型在稳定散列前先过滤、去重并限制子池，且时间边界可使用原列索引', () => {
    const query = buildCandidatePoolQuery({
      userId: 'user-1',
      date: '2026-09-01',
      shiftMinutes: 480,
      reasonCode: 'active_tag',
      activeTagIds: ['tag-1', 'tag-1', 'tag-2'],
    });

    expect(query.sql).not.toContain('IN ()');
    expect(query.sql.match(/LIMIT 60/g)).toHaveLength(4);
    expect(query.sql.match(/GROUP BY active_resources\.resource_type/g)).toHaveLength(3);
    expect(query.sql.match(/recap_state\.dismissed_at IS NULL/g)).toHaveLength(3);
    expect(query.sql).toContain(
      "b.create_time < DATE_SUB(DATE_SUB(DATE '2026-09-01', INTERVAL 30 DAY), INTERVAL 480 MINUTE)",
    );
    expect(query.sql).not.toContain('DATE_ADD(b.create_time, INTERVAL 480 MINUTE) <');
    expect(query.sql).toContain("CRC32(CONCAT(?, ':', candidate_pool.resource_type, ':', candidate_pool.resource_id))");
    expect(query.params.at(-1)).toBe('user-1:2026-09-01');
  });

  it('最近活跃标签查询把账号日历边界换算成 UTC 原列范围', () => {
    const query = buildActiveTagsQuery({ userId: 'user-1', date: '2026-09-01', shiftMinutes: -420 });
    expect(query.sql).toContain(
      "b.create_time >= DATE_SUB(DATE_SUB(DATE '2026-09-01', INTERVAL 13 DAY), INTERVAL -420 MINUTE)",
    );
    expect(query.sql).toContain(
      "b.create_time < DATE_SUB(DATE_ADD(DATE '2026-09-01', INTERVAL 1 DAY), INTERVAL -420 MINUTE)",
    );
    expect(query.sql).not.toContain('DATE_ADD(b.create_time, INTERVAL -420 MINUTE) >=');
  });

  it('候选响应固化判定时使用的账号本地资源日期，不让浏览器重新解释无时区时间', () => {
    const query = buildCandidatePoolQuery({
      userId: 'user-1',
      date: '2026-08-31',
      shiftMinutes: -420,
      reasonCode: 'on_this_day',
    });
    expect(query.sql).toContain("DATE_FORMAT(DATE_ADD(b.create_time, INTERVAL -420 MINUTE), '%Y-%m-%d')");

    const selected = selectDailyReviewCandidates({
      userId: 'user-1',
      date: '2026-08-31',
      onThisDay: [
        {
          ...candidate('note', 'n-boundary', 'on_this_day'),
          create_time: '2025-09-01 02:30:00',
          resource_date: '2025-08-31',
        },
      ],
    });
    expect(selected[0]).toMatchObject({ resourceDate: '2025-08-31', time: '2025-09-01 02:30:00' });
  });

  it('书签可打开条件只接受无空白的 HTTP(S) 地址', () => {
    expect(dailyReviewBookmarkUrlCondition('b.url')).toBe("LOWER(TRIM(b.url)) REGEXP '^https?://[^[:space:]]+$'");
  });

  it('落入子池的历史畸形 URL 仍由共享 resolver 精确剔除，不占每日 slot', () => {
    expect(resolveDailyReviewBookmarkUrl('https://user:password@example.com/private')).toBeNull();
    expect(resolveDailyReviewBookmarkUrl('看看这个 https://example.com/article')).toBeNull();
    expect(
      selectDailyReviewCandidates({
        userId: 'user-1',
        date: '2026-09-01',
        onThisDay: [
          { ...candidate('bookmark', 'bad', 'on_this_day'), url: 'https://user:password@example.com/private' },
          candidate('note', 'n1', 'on_this_day'),
        ],
      }).map((item) => item.resourceId),
    ).toEqual(['n1']);
  });
});
