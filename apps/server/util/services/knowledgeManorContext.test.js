import { beforeEach, describe, expect, it, vi } from 'vitest';
const facts = vi.hoisted(() => ({ growth: { points: 60, streak: 0 }, milestones: [], role: 'root', deleted: 0 }));
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../growth.js', () => ({
  getGrowth: async () => facts.growth, lockGrowthAccount: vi.fn(),
  getDailyQuestState: async () => ({ quests: [{ key:'checkin', done:true }, { key:'daily_note',done:false }, { key:'daily_file',done:false }] }),
}));
vi.mock('../points.js', () => ({ earnPoints: vi.fn() }));
vi.mock('../growthPreferences.js', () => ({ getGrowthCalendarContext: async () => ({ dayKey:'20261024', weekKey:'202643', utcOffsetMinutes:480 }) }));
vi.mock('../weeklyChallenge.js', () => ({ getWeeklyChallenges: async () => ({ challenges: [{ done:false }] }) }));
import { createKnowledgeManorService } from './knowledgeManorService.js';

describe('庄园沿用真实成长进度', () => {
  beforeEach(() => Object.assign(facts, { growth: { points:60, streak:0 }, milestones:[], role:'root', deleted:0 }));
  const read = () => {
    const conn = { beginTransaction:vi.fn(), commit:vi.fn(), rollback:vi.fn(), release:vi.fn(), query:async sql => {
      if(sql.includes('FROM user WHERE')) return [[{role:facts.role,del_flag:facts.deleted}]];
      if(sql.includes('FROM points_log')) return [facts.milestones.map(ref=>({ref}))];
      if(sql.includes('FROM knowledge_manors')) return [[]];
      throw new Error('Unexpected SQL');
    } };
    return createKnowledgeManorService({ db:{ getConnection:async()=>conn }, now:()=>new Date('2026-10-24T02:00:00Z') }).get('owner');
  };
  it('连签已达 7 天即符合种子条件，不要求先领取另一项奖励', async () => {
    facts.growth.streak=7;
    expect((await read()).state.supplyEligibility).toMatchObject({'streak-7':true,'streak-30':false,'week-all':false});
  });
  it('较高的历史连签收据保留已达成的各档资格，不重新发积分', async () => {
    facts.milestones=['100'];
    const result=await read();
    expect(result.state.supplyEligibility).toMatchObject({'streak-7':true,'streak-30':true,'streak-100':true});
    expect(result.state.wallet).toBe(60); expect(result.state.seeds).toEqual({});
  });
  it('未达成不能预领；任务完成事实由原成长域返回', async () => {
    const result=await read();
    expect(result.state.supplyEligibility['streak-7']).toBe(false);
    expect(result.state.dailyDone).toEqual([true,false,false]);
  });
  it.each([{role:'user',deleted:0},{role:'test',deleted:0},{role:'visitor',deleted:0},{role:'root',deleted:1}])('服务层也拒绝非 Root 或不可用账号 %j', async values => {
    Object.assign(facts,values);
    await expect(read()).rejects.toMatchObject({code:'MANOR_ACCOUNT_UNAVAILABLE'});
  });
});
