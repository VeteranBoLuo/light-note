import { describe, expect, it, vi } from 'vitest';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
const calendar = { date: '2026-09-08', yesterdayStart: '2026-09-07 00:00:00', locale: 'zh-CN' };
function db(results = [], projects = [], attention = []) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce([results])
      .mockResolvedValueOnce([projects])
      .mockResolvedValueOnce([attention]),
  };
}
describe('workshop brief facts', () => {
  it('returns empty facts without manufacturing conclusions', async () => {
    const database = db([{ content: '# 标题\n\n短句' }]);
    const facts = await compileWorkshopBriefFacts(database, 'owner', calendar);
    expect(facts.every((fact) => fact.count === 0)).toBe(true);
    expect(database.query.mock.calls[0][1][0]).toBe('owner');
    expect(database.query.mock.calls[1][1][4]).toBe('owner');
  });
  it('keeps coverage limitations and opens the original task, with stable versions', async () => {
    const result = {
      id: 'artifact',
      job_id: 'job',
      title: '结论',
      artifact_version: 1,
      content: '## 结论\n这是从所选资料中提取出来的主要结论，可以回到原成果查看相关依据。',
      coverage_json: { complete: false },
    };
    const [fact] = await compileWorkshopBriefFacts(db([result]), 'owner', calendar);
    expect(fact.samples[0]).toContain('资料未完整读取');
    expect(fact.route).toBe('/toolbox/task/job');
    const [changed] = await compileWorkshopBriefFacts(db([{ ...result, artifact_version: 2 }]), 'owner', calendar);
    expect(changed.revision).not.toBe(fact.revision);
  });
  it('does not treat a recently changed distant project as due, or repeat a due project as next step', async () => {
    const facts = await compileWorkshopBriefFacts(
      db(
        [],
        [
          {
            id: 'far',
            kind: 'research',
            target_date: '2026-12-01',
            pending: 1,
            next_step: '收集来源',
            title: '长期项目',
          },
          { id: 'soon', kind: 'learning', target_date: '2026-09-15', pending: 1, next_step: '复习', title: '考试' },
        ],
      ),
      'owner',
      calendar,
    );
    expect(facts[2].sources[0].id).toBe('soon');
    expect(facts[1].sources[0].id).toBe('far');
  });
  it('纯编号和空白下一步不占位，有文字的明确行动仍可入选', async () => {
    const facts = await compileWorkshopBriefFacts(
      db(
        [],
        [
          { id: 'number', kind: 'research', title: '测试项目', pending: 1, next_step: '2323112113' },
          { id: 'blank', kind: 'research', title: '空项目', pending: 1, next_step: '  ' },
          { id: 'action', kind: 'research', title: '研究', pending: 1, next_step: '核对原始来源' },
        ],
      ),
      'owner',
      calendar,
    );
    expect(facts[1]).toMatchObject({ sources: [{ id: 'action' }], samples: ['研究：核对原始来源'] });
    const quiet = await compileWorkshopBriefFacts(
      db([], [{ id: 'number', pending: 1, next_step: '2323112113' }]),
      'owner',
      calendar,
    );
    expect(quiet[1].count).toBe(0);
  });
  it('长成果摘录尽量保留完整句子，无法完整截取时明确省略', async () => {
    const sentence = '这是基于所选资料得出的完整结论，后续应回到原成果核对每一项具体依据。';
    const artifact = {
      id: 'a',
      job_id: 'j',
      content: `## 结论\n${sentence}${'更多材料内容'.repeat(50)}`,
      coverage_json: { complete: false },
    };
    const facts = await compileWorkshopBriefFacts(db([artifact]), 'owner', calendar);
    expect(facts[0].samples).toEqual([`资料未完整读取：${sentence}`]);
    artifact.content = `## 结论\n${'详细结论'.repeat(100)}`;
    const unbroken = (await compileWorkshopBriefFacts(db([artifact]), 'owner', calendar))[0].samples[0];
    expect(unbroken.length).toBeLessThanOrEqual(120);
    expect(unbroken.endsWith('…')).toBe(true);
  });
  it.each(['failed', 'save_failed'])('未移除的 %s 任务保留准确状态和原任务入口', async (status) => {
    const row = {
      id: 'failed-job',
      title: '报告',
      status: status === 'failed' ? 'failed' : 'succeeded',
      save_status: status === 'save_failed' ? 'save_failed' : 'unsaved',
      updated_at: '2026-10-10 12:00:00',
    };
    const database = db([], [], [row]);
    const facts = await compileWorkshopBriefFacts(database, 'owner', calendar);
    expect(facts[3]).toMatchObject({
      id: 'workshop_attention',
      count: 1,
      route: '/toolbox/task/failed-job',
      sources: [{ type: 'toolbox_task', id: 'failed-job' }],
      samples: [status === 'failed' ? '工坊任务处理失败：报告' : '工坊成果保存失败：报告'],
    });
    expect(database.query.mock.calls[2][1]).toEqual(['owner']);
    expect(database.query.mock.calls[2][0]).toContain('homeDismissed');
    const completed = await compileWorkshopBriefFacts(db(), 'owner', calendar);
    expect(completed[3]).toMatchObject({ count: 0, sources: [], samples: [] });
    expect(completed[3].revision).not.toBe(facts[3].revision);
  });
});

describe('project and action dates', () => {
  it('prioritizes today, merges same project and ignores inactive or completed-only targets', async () => {
    const projects = [
      { id: 'late', kind: 'research', title: '逾期', pending: 1, target_date: '2026-09-01' },
      {
        id: 'today',
        kind: 'learning',
        title: '学习',
        pending: 1,
        target_date: '2026-09-12',
        action_date: '2026-09-08',
        action_title: '闭卷练习',
        next_step: '复盘',
      },
      { id: 'done', status: 'completed', pending: 1, target_date: '2026-09-08' },
      { id: 'empty', pending: 0, target_date: '2026-09-08' },
    ];
    const facts = await compileWorkshopBriefFacts(db([], projects), 'owner', calendar);
    expect(facts[2]).toMatchObject({ urgency: 'today', sources: [{ id: 'today' }] });
    expect(facts[2].samples[0]).toContain('闭卷练习');
    expect(facts[1].sources).toEqual([]);
  });
  it('changes fingerprints across date grades and completion; stays stable within the same day', async () => {
    const row = {
      id: 'p',
      kind: 'research',
      title: '研究',
      pending: 1,
      action_date: '2026-09-09',
      action_title: '行动',
    };
    const read = async (date, project = row) =>
      (await compileWorkshopBriefFacts(db([], [project]), 'owner', { ...calendar, date }))[2];
    const upcoming = await read('2026-09-08'),
      today = await read('2026-09-09'),
      overdue = await read('2026-09-10');
    expect([upcoming.urgency, today.urgency, overdue.urgency]).toEqual(['upcoming', 'today', 'overdue']);
    expect(new Set([upcoming.revision, today.revision, overdue.revision]).size).toBe(3);
    expect((await read('2026-09-09')).revision).toBe(today.revision);
    expect((await read('2026-09-09', { ...row, action_date: null, pending: 0 })).count).toBe(0);
  });
});
