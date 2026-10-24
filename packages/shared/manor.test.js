import { describe, expect, it } from 'vitest';
import { createManor, executeManorCommand, projectManor, manorModel as M, MANOR_SPECIES as F } from './manor.js';

const context = (extra = {}) => ({
  now: new Date('2026-10-24T02:00:00Z'), points: 60,
  calendar: { dayKey: '20261024', weekKey: '202643', utcOffsetMinutes: 480 },
  dailyDone: [false, false, false], random: () => 0, ...extra,
});
const command = (s, action, args = [], ctx = context({ points: s.wallet })) => executeManorCommand(s, { action, args }, ctx);
const adopted = () => command(createManor(context()), 'adopt').state;

describe('正式庄园沿用确认玩法与轻笺积分', () => {
  it('新存档没有演示等级、鱼、作物或额外积分；见面礼只有一次', () => {
    const s = createManor(context());
    expect(s.wallet).toBe(60);
    expect(s.xp).toBe(0);
    expect(s.fish).toEqual([]);
    expect(s.seeds).toEqual({});
    const first = command(s, 'adopt');
    expect(first.pointsDelta).toBe(0);
    expect(first.state).toMatchObject({ water: 30, seeds: { radish: 3 }, guide: 'plant' });
    expect(command(first.state, 'adopt').state).toEqual(first.state);
  });
  it('买种子消费原积分，卖出收获增加同一余额；价格和生长周期保留', () => {
    let s = command(adopted(), 'buySeed', ['radish', 1]).state;
    expect(s.wallet).toBe(58);
    expect(s.seeds.radish).toBe(4);
    s = command(s, 'plant', [0, 'radish']).state;
    s = command(s, 'water', [[0]]).state;
    expect(s.plots[0].next - s.now).toBe(4);
    s = command(s, 'harvest', [[0]], context({ points: 58, now: new Date('2026-10-24T06:00:00Z') })).state;
    const sold = command(s, 'sellCrop', ['radish', 1], context({ points: 58, now: new Date('2026-10-24T06:00:00Z') }));
    expect(sold.pointsDelta).toBe(3);
    expect(sold.state.wallet).toBe(61);
    expect(sold.state.crops.radish).toBe(0);
  });
  it('合法库存出售不新增日周上限，不回收已获得的库存', () => {
    const s = adopted(); s.crops.starpumpkin = 100; s.weekEarned = 1000;
    const sold = command(s, 'sellAllCrops');
    expect(sold.result).toEqual({ sold: 100, points: 4000 });
    expect(sold.pointsDelta).toBe(4000);
  });
  it('投影实时读取主站余额，并不依赖存档内的过时钱包数值', () => {
    const s = adopted(); s.wallet = 99999;
    expect(projectManor(s, context({ points: 7 })).wallet).toBe(7);
    const r = command(s, 'buyBait', [1], context({ points: 7 }));
    expect(r.result).toBe(false);
    expect(r.pointsDelta).toBe(0);
    expect(r.state.wallet).toBe(7);
  });
  it('未浇水不生长、离线成熟不枯死，施肥仍受半轮限制', () => {
    let s = command(adopted(), 'plant', [0, 'radish']).state;
    const tomorrow = context({ now: new Date('2026-10-25T02:00:00Z'), calendar: { dayKey: '20261025', weekKey: '202643', utcOffsetMinutes: 480 } });
    expect(M.plotState(projectManor(s, tomorrow), 0)).toBe('dry');
    s = command(s, 'water', [[0]]).state;
    s.fertilizers.legend = 1;
    const r = command(s, 'fertilize', [0, 'legend']);
    expect(r.result).toBe(2);
    expect(M.plotState(projectManor(r.state, tomorrow), 0)).toBe('ripe');
  });
  it('任务水滴只能来自既有成长完成事实，满桶剩余额度保留', () => {
    let s = adopted(); s.water = 58;
    expect(command(s, 'claimDailyWater', [0]).result).toBeNull();
    const ctx = context({ dailyDone: [true, false, false] });
    s = command(s, 'claimDailyWater', [0], ctx).state;
    expect(s.water).toBe(60);
    expect(s.dailyWaterClaims).toEqual([2, 0, 0]);
    s.water = 55;
    const rest = command(s, 'claimDailyWater', [0], ctx);
    expect(rest.result.water).toBe(3);
    expect(command(rest.state, 'claimDailyWater', [0], ctx).result).toBeNull();
  });
  it('三项任务完成的两颗基础种子每账号日仅发一次', () => {
    const ctx = context({ dailyDone: [true, true, true] });
    const s = command(adopted(), 'claimAllDailyWater', [], ctx).state;
    expect(s.seeds.radish).toBe(5);
    expect(command(s, 'claimAllDailyWater', [], ctx).state.seeds.radish).toBe(5);
  });
  it('账号跨日清理日额度、跨周清理统计，不改变生长时间或积分', () => {
    const s = adopted(); s.freeUsed = 3; s.dailyWaterClaims = [5, 5, 5]; s.weekEarned = 200;
    const p = projectManor(s, context({ now: new Date('2026-10-26T02:00:00Z'), calendar: { dayKey: '20261026', weekKey: '202644', utcOffsetMinutes: 480 } }));
    expect(p).toMatchObject({ freeUsed: 0, dailyWaterClaims: [0, 0, 0], weekEarned: 0, calendarDay: 3, wallet: 60 });
    expect(p.now - s.now).toBe(48);
    expect(s.freeUsed).toBe(3);
  });
  it('连签和每周种子凭服务端事实领取，周奖励跨周后可再次领取', () => {
    const s = adopted();
    expect(command(s, 'claimSupply', ['streak-7']).result).toBeNull();
    const ctx = context({ supplyEligibility: { 'streak-7': true, 'week-all': true } });
    let r = command(s, 'claimSupply', ['streak-7'], ctx);
    expect(r.result).toEqual({ seed: 'rainbowcorn', count: 1 });
    expect(command(r.state, 'claimSupply', ['streak-7'], ctx).result).toBeNull();
    r = command(r.state, 'claimSupply', ['week-all'], ctx);
    expect(command(r.state, 'claimSupply', ['week-all'], ctx).result).toBeNull();
    const nextWeek = context({ ...ctx, now: new Date('2026-10-26T02:00:00Z'),
      calendar: { dayKey: '20261026', weekKey: '202644', utcOffsetMinutes: 480 } });
    expect(command(r.state, 'claimSupply', ['week-all'], nextWeek).result).toEqual({ seed: M.RARE[0], count: 1 });
  });
  it('图鉴里程碑只认已拥有记录，不接受 eligibility 冒领', () => {
    const s = adopted(), ctx = context({ supplyEligibility: { 'dex-30': true } });
    expect(command(s, 'claimSupply', ['dex-30'], ctx).result).toBeNull();
    for (const kind of Object.keys(F).slice(0, 30)) s.discoveries[kind] = 1;
    const r = command(s, 'claimSupply', ['dex-30']);
    expect(r.result).toEqual({ seed: 'moonorchid', count: 1 });
    expect(command(r.state, 'claimSupply', ['dex-30']).result).toBeNull();
  });
  it('夏令时和账号时区以服务端日历刷新额度，作物按真实经过时间生长', () => {
    const before = context({ now: new Date('2026-11-01T05:30:00Z'),
      calendar: { dayKey: '20261101', weekKey: '202644', utcOffsetMinutes: -240 } });
    let s = command(createManor(before), 'adopt', [], before).state;
    s = command(s, 'plant', [0, 'radish'], before).state;
    s = command(s, 'water', [[0]], before).state;
    s.freeUsed = 2;
    const after = context({ now: new Date('2026-11-01T06:30:00Z'),
      calendar: { dayKey: '20261101', weekKey: '202644', utcOffsetMinutes: -300 } });
    const p = projectManor(s, after);
    expect(p.now - s.now).toBe(1);
    expect(p.plots[0].next - p.now).toBe(3);
    expect(p.freeUsed).toBe(2);
    expect(p.calendarDay).toBe(1);
  });
  it('切换时区再回到已使用的账号日期，不能重新获得免费次数、水滴和地面奖励', () => {
    const a = context({ now:new Date('2026-10-24T12:00:00Z'), dailyDone:[true,false,false],
      calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:840} });
    const b = context({ ...a, calendar:{dayKey:'20261024',weekKey:'202643',utcOffsetMinutes:-720} });
    let s = command(adopted(), 'plant', [0,'radish']).state;
    s = command(s, 'water', [[0]]).state;
    s.purifier={level:1,purchasedAt:0,claimDay:null,claimedWater:0};
    for (const ctx of [a,b]) {
      s=command(s,'claimDailyWater',[0],ctx).state;
      s=command(s,'claimPurifier',[],ctx).state;
      s=command(s,'pickPoop',[],ctx).state;
      s=command(s,'pickBirdSeed',[],ctx).state;
      for(let i=0;i<3;i++) {
        const started=command(s,'beginCast',['bait'],ctx);
        expect(started.result).toBe('free');
        const caught=command(started.state,'resolveCast',[started.state.castId],ctx);
        s=caught.state;
        if(caught.result.firstCatch) s=command(s,'place',[caught.result.fish.id,0],ctx).state;
      }
    }
    const returned=projectManor(s,a);
    expect(returned.freeUsed).toBe(3);
    expect(command(returned,'beginCast',['bait'],a).result).toBeNull();
    expect(command(returned,'claimDailyWater',[0],a).result).toBeNull();
    expect(command(returned,'claimPurifier',[],a).result).toBeNull();
    expect(command(returned,'pickPoop',[],a).result).toBe(false);
    expect(command(returned,'pickBirdSeed',[],a).result).toBe(false);
  });
  it('鱼苗袋和蜂箱的每日使用记录也不会因切回日期而重置', () => {
    const a=context({now:new Date('2026-10-24T12:00:00Z'),calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:840}});
    const b=context({...a,calendar:{dayKey:'20261024',weekKey:'202643',utcOffsetMinutes:-720}});
    let s=adopted();s.guide=null;s.xp=M.RULES.levels[5];s.seeds.tomato=3;
    s.beehive={purchasedAt:0,pollen:6,lastPollinatedDay:null};
    for(const [i,ctx] of [a,b].entries()) {
      s=command(s,'plant',[i,'tomato'],ctx).state;
      s=command(s,'water',[[i]],ctx).state;
      const result=command(s,'pollinate',[i],ctx);expect(result.result).toBe(true);s=result.state;
      s.fryDay=M.day(s);s.fryUsed=2;
    }
    s=projectManor(s,a);
    expect(command(s,'buyFry',[],a).result).toBeNull();
    s=command(s,'plant',[2,'tomato'],a).state;
    s=command(s,'water',[[2]],a).state;
    expect(command(s,'pollinate',[2],a).result).toBe(false);
    expect(s.beehive.pollen).toBe(4);
  });
  it('首钓、每日三次、25%命中及稀有度沿用原规则；强制物种入口不开放', () => {
    expect(M.RULES).toMatchObject({ dailyFree: 3, success: 0.25, firstFish: 'clown' });
    const started = command(adopted(), 'beginCast', ['bait']);
    expect(started.state.freeUsed).toBe(1);
    expect(() => command(started.state, 'resolveCast', ['fake'])).toThrow('MANOR_COMMAND_INVALID');
    expect(() => command(started.state, 'resolveCast', [started.state.castId, 'whale'])).toThrow('MANOR_COMMAND_INVALID');
    const caught = command(started.state, 'resolveCast', [started.state.castId]);
    expect(caught.result.fish.kind).toBe('clown');
    expect(caught.state.casting).toBe(false);
    expect(caught.state.castId).toBeUndefined();
  });
  it('非法状态、时钟、奖励模拟、物种注入、越界和重复地块不能变更存档', () => {
    const s = adopted(), before = structuredClone(s);
    for (const [action, args] of [['advance', [999]], ['grantSeed', ['moonorchid', 999]], ['create', ['full']], ['completeDaily', [0]], ['plant', [0, '__proto__']], ['water', [[0, 0]]], ['place', [1, -1]], ['sellCrop', ['radish', 1.5]]]) {
      expect(() => command(s, action, args)).toThrow('MANOR_COMMAND_INVALID');
    }
    expect(s).toEqual(before);
  });
  it('111 种水族、15 种作物及设备定价保持确认版本', () => {
    expect(Object.keys(F)).toHaveLength(111);
    expect(Object.keys(M.CROPS)).toHaveLength(15);
    expect(M.FACILITIES.workshop.cost).toBe(180);
    expect(M.FACILITIES.beehive.cost).toBe(160);
    expect(M.RULES.purifierLevels.map(p => p.cost)).toEqual([240, 180, 360]);
  });
});
