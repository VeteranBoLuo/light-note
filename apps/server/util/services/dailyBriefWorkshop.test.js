import { describe, expect, it, vi } from 'vitest';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
const calendar = { date: '2026-09-08', yesterdayStart: '2026-09-07 00:00:00', locale: 'zh-CN' };
function db(results = [], projects = []) {
  return { query: vi.fn().mockResolvedValueOnce([results]).mockResolvedValueOnce([projects]) };
}
describe('workshop brief facts', () => {
  it('returns empty facts without manufacturing conclusions', async () => {
    const database = db([{ content: '# 标题\n\n短句' }]);
    const facts = await compileWorkshopBriefFacts(database, 'owner', calendar);
    expect(facts.every((fact) => fact.count === 0)).toBe(true);
    expect(database.query.mock.calls.every(([, args]) => args[0] === 'owner')).toBe(true);
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
});
