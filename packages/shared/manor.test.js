import { describe, expect, it } from 'vitest';
import { createManor, executeManorCommand, projectManor, manorModel as M, MANOR_SPECIES as F, MANOR_VERSION } from './manor.js';

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
  it('三项任务完成只领取水滴，不自动赠种，也不回收旧赠种或其他补给', () => {
    const ctx = context({ dailyDone: [true, true, true] });
    const s = command(adopted(), 'claimAllDailyWater', [], ctx).state;
    expect(s.water).toBe(45);
    expect(s.seeds).toEqual({radish:3});
    expect(s.rewards).not.toHaveProperty('daily-pack:20261024');
    s.seeds.radish=5;s.rewards['daily-pack:20261024']=s.now;
    const old=command(s,'claimAllDailyWater',[],ctx).state;
    expect(old.seeds.radish).toBe(5);
    expect(old.rewards['daily-pack:20261024']).toBe(s.now);
    const local=M.create();M.adopt(local);
    for(let i=0;i<3;i++)expect(M.completeDaily(local,i)).toBe(true);
    expect(M.claimAllDailyWater(local)).toEqual({water:15,pending:0});
    expect(local.seeds).toEqual({radish:3});
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
  it('111 种水族、22 种作物及设备定价保持确认版本', () => {
    expect(Object.keys(F)).toHaveLength(111);
    expect(Object.keys(M.CROPS)).toHaveLength(22);
    expect(M.FACILITIES.workshop.cost).toBe(180);
    expect(M.FACILITIES.beehive.cost).toBe(160);
    expect(M.RULES.purifierLevels.map(p => p.cost)).toEqual([240, 180, 360]);
  });
});

describe('新增作物沿用服务端购买、生长、续收和积分结算', () => {
  it.each([
    ['pea',3,8,2],['potato',5,20,3],['cucumber',7,52,6],['rosemary',9,72,4],
    ['watermelon',11,36,5],['grape',16,100,12],['tea',20,168,18],
  ])('%s 从购买到完整收获出售，刷新不换种、不跳过生长，净收益符合定位', (key, unlock, totalHours, net) => {
    let s=adopted(),hours=0;
    const start=context().now.getTime();
    const ctx=()=>{
      const now=new Date(start+hours*3_600_000);
      return context({points:s.wallet,now,calendar:{...context().calendar,
        dayKey:new Date(now.getTime()+8*3_600_000).toISOString().slice(0,10).replaceAll('-','')}});
    };
    s.xp=M.RULES.levels[unlock-2];
    expect(command(s,'buySeed',[key,1],ctx()).result).toBe(false);
    expect(s.wallet).toBe(60);
    s.xp=M.RULES.levels[unlock-1];
    s=command(s,'buySeed',[key,1],ctx()).state;
    expect(s.seeds[key]).toBe(1);
    s=command(s,'plant',[0,key],ctx()).state;
    expect(M.plotState(s,0)).toBe('dry');
    s=command(s,'water',[[0]],ctx()).state;
    expect(M.plotState(s,0)).toBe('growing');
    hours=1/60;
    s=projectManor(s,ctx());
    expect(s.plots[0].crop).toBe(key);expect(M.plotState(s,0)).toBe('growing');
    expect(command(s,'harvest',[[0]],ctx()).result).toEqual([]);
    const c=M.CROPS[key];
    for(let round=0;round<c.harvests;round++) {
      hours=c.first+round*c.every;
      const result=command(s,'harvest',[[0]],ctx());s=result.state;
      expect(result.result).toEqual([expect.objectContaining({key,quantity:1})]);
      if(round<c.harvests-1){expect(s.plots[0].crop).toBe(key);expect(M.plotState(s,0)).toBe('growing');}
    }
    expect(hours).toBe(totalHours);expect(s.crops[key]).toBe(c.harvests);
    expect(M.plotState(s,0)).toBe(c.type==='flower'?'bloom':'empty');
    expect(command(s,'harvest',[[0]],ctx()).result).toEqual([]);
    const sold=command(s,'sellCrop',[key],ctx());
    expect(sold.pointsDelta).toBe(c.sell*c.harvests);
    expect(sold.state.wallet).toBe(60+net);expect(sold.state.crops[key]).toBe(0);
  });

  it('迷迭香补四份花粉，黄瓜与葡萄沿用每株一次的授粉限制', () => {
    const s=adopted();s.guide=null;s.xp=M.RULES.levels[19];s.wallet=1000;
    expect(M.buyFacility(s,'beehive')).toBe(true);
    s.crops.rosemary=2;
    expect(M.refillPollen(s,'rosemary')).toBe(4);expect(s.crops.rosemary).toBe(1);
    for(const [i,key] of ['cucumber','grape'].entries()) {
      s.seeds[key]=1;M.plant(s,i,key);M.water(s,[i]);
      expect(M.pollinationEligible(s,i)).toBe(true);
    }
    expect(M.pollinate(s,0)).toBeTruthy();expect(M.pollinationEligible(s,0)).toBe(false);
    expect(M.pollinate(s,0)).toBe(false);
  });
});

describe('庄园 v2 保底、花粉与旧存档兼容', () => {
  const cast=(s,choice='bait',ctx=context({points:s.wallet,random:()=>.999}))=>{
    const started=command(s,'beginCast',[choice],ctx);
    expect(started.result).toBeTruthy();
    return command(started.state,'resolveCast',[started.state.castId],ctx);
  };
  it('免费、普通和定向共用四次空竿，第五次成功并清零；基础率与权重保留', () => {
    let s=adopted();s.firstCastDone=true;s.craftedBait={fruit:1,herb:1};s.bait=1;
    expect(M.RULES).toMatchObject({success:.25,pityCasts:5,dailyFree:3});
    expect(M.FACILITY_RULES.targetWeight).toBe(4);
    for(const [i,choice] of ['bait','bait','bait','fruit','herb'].entries()) {
      const result=cast(s,choice);s=result.state;
      expect(Boolean(result.result.fish)).toBe(i===4);
      expect(s.emptyCastStreak).toBe(i===4?0:i+1);
      expect(s.castPity).toBeUndefined();
    }
    expect(s.craftedBait).toEqual({fruit:0,herb:0});
    // The pity does not force a low rarity or the first-catch species.
    expect(F[s.fish[0].kind].quality).toBe('传说');
    const ordinary=cast(s);
    expect(ordinary.result.fish).toBeNull();expect(ordinary.state.emptyCastStreak).toBe(1);
  });
  it('每日免费次数刷新、时区往返与存档重载不清零或回退空竿进度', () => {
    let s=adopted();s.firstCastDone=true;
    for(let i=0;i<3;i++)s=cast(s).state;
    const a=context({now:new Date('2026-10-25T02:00:00Z'),calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480},random:()=>.999});
    s=projectManor(JSON.parse(JSON.stringify(s)),a);
    expect(s).toMatchObject({freeUsed:0,emptyCastStreak:3});
    s=cast(s,'bait',a).state;expect(s.emptyCastStreak).toBe(4);
    s.bait=1;
    const previousDay=context({...a,calendar:{dayKey:'20261024',weekKey:'202643',utcOffsetMinutes:-720}});
    s=projectManor(s,previousDay);expect(s.emptyCastStreak).toBe(4);
    expect(cast(s,'bait',previousDay).state.emptyCastStreak).toBe(0);
  });
  it('自然上钩、彩虹饵和一次性新手首钓都清零，后续每日首竿没有必得特权', () => {
    let s=adopted();s.emptyCastStreak=3;
    const first=cast(s);s=first.state;
    expect(first.result.firstCatch).toBe(true);expect(s.emptyCastStreak).toBe(0);
    s=command(s,'place',[first.result.fish.id,0]).state;
    s=cast(s).state;expect(s.emptyCastStreak).toBe(1);
    const hit=cast(s,'bait',context({random:()=>.249}));s=hit.state;
    expect(hit.result.fish).toBeTruthy();expect(s.emptyCastStreak).toBe(0);
    s.rainbowBait=1;s.emptyCastStreak=2;
    const rainbow=cast(s,'rainbow');s=rainbow.state;
    expect(rainbow.result.fish).toBeTruthy();expect(s.emptyCastStreak).toBe(0);
    const tomorrow=context({now:new Date('2026-10-25T02:00:00Z'),calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480},random:()=>.999});
    const again=cast(s,'bait',tomorrow);
    expect(again.result.fish).toBeNull();expect(again.state.emptyCastStreak).toBe(1);
  });
  it('旧存档只读投影升级，资产保留；旧进行中的一竿不计新保底', () => {
    const old=adopted();old.version='knowledge-manor-v1';delete old.emptyCastStreak;
    old.firstCastDone=true;old.seeds.radish=9;old.rewards['daily-pack:20261024']=old.now;
    old.beehive={purchasedAt:0,pollen:2,lastPollinatedDay:null};
    const before=structuredClone(old),projected=projectManor(old,context());
    expect(projected).toMatchObject({version:MANOR_VERSION,emptyCastStreak:0,seeds:{radish:9},beehive:{pollen:2}});
    expect(old).toEqual(before);
    old.casting=true;old.castPending=true;old.castSource='free';old.castId='old-cast';
    const result=command(old,'resolveCast',['old-cast'],context({random:()=>.999}));
    expect(result.result.fish).toBeNull();expect(result.state.emptyCastStreak).toBe(0);
    const modern=cast(result.state);
    expect(modern.result.fish).toBeNull();expect(modern.state.emptyCastStreak).toBe(1);
    expect(()=>projectManor({...old,version:'future'},context())).toThrow('MANOR_VERSION_UNSUPPORTED');
  });
  it('蜂箱仍160积分，三种配方按3/6/4扣库存，满仓不损耗花束', () => {
    const s=adopted();s.xp=M.RULES.levels[5];s.wallet=200;
    expect(M.buyFacility(s,'beehive')).toBe(true);expect(s.wallet).toBe(40);
    s.crops={lavender:2,sunflower:2,rosemary:2};
    expect(M.refillPollen(s,'lavender')).toBe(3);expect(s.beehive.pollen).toBe(3);
    expect(M.refillPollen(s,'rosemary')).toBe(0);expect(s.crops.rosemary).toBe(2);
    expect(M.refillPollen(s,'lavender')).toBe(3);expect(s.beehive.pollen).toBe(6);
    expect(M.refillPollen(s,'sunflower')).toBe(0);expect(s.crops.sunflower).toBe(2);
    s.beehive.pollen=0;expect(M.refillPollen(s,'rosemary')).toBe(4);
    s.beehive.pollen=0;expect(M.refillPollen(s,'sunflower')).toBe(6);
  });
});

describe('堆肥箱把完整采收残枝用于下一轮种植', () => {
  const built = () => {
    const s=adopted();s.xp=M.RULES.levels[8];s.wallet=320;
    expect(M.buyFacility(s,'composter')).toBe(true);return s;
  };
  const reap = (s,key,i=0) => {
    s.seeds[key]=(s.seeds[key]||0)+1;s.water=60;
    expect(M.plant(s,i,key)).toBe(true);M.water(s,[i]);
    s.now=s.plots[i].next;return M.harvest(s,[i]);
  };
  it('Lv.9 消费原积分建造一次，旧存档没有隐式残枝库存', () => {
    const s=adopted();s.wallet=320;s.xp=M.RULES.levels[7];
    expect(command(s,'buyFacility',['composter']).result).toBe(false);
    s.xp=M.RULES.levels[8];const result=command(s,'buyFacility',['composter']);
    expect(result.pointsDelta).toBe(-120);
    expect(result.state.composter).toEqual({purchasedAt:s.now,level:1,residue:0,stock:0,nextReady:null});
    expect(command(result.state,'buyFacility',['composter']).pointsDelta).toBe(0);
    delete s.composter;reap(s,'radish');expect(s.composter).toBeUndefined();
  });
  it('三株完整采收自动开始，投影只读，12 小时后领取不重复发放', () => {
    const s=built();for(let i=0;i<3;i++)reap(s,'radish');
    expect(M.composterStatus(s)).toMatchObject({residue:0,stock:0,phase:'working',remaining:12});
    const original=structuredClone(s.composter);s.now+=12;
    expect(M.composterStatus(s)).toMatchObject({stock:1,phase:'ready'});
    expect(s.composter).toEqual(original);
    expect(M.collectCompost(s)).toBe(1);expect(s.fertilizers.eco).toBe(1);
    expect(M.collectCompost(s)).toBe(0);expect(s.fertilizers.eco).toBe(1);
  });
  it.each(['cucumber','lavender'])('%s 只在最后一次采收留下残枝，增产和铲除不额外发放', key => {
    const s=built();s.xp=M.RULES.levels[19];reap(s,key);
    for(let n=1;n<M.CROPS[key].harvests;n++) {
      expect(M.composterStatus(s).residue).toBe(0);
      s.now=s.plots[0].next;M.harvest(s,[0]);
    }
    expect(M.composterStatus(s).residue).toBe(1);
    M.harvest(s,[0]);expect(M.composterStatus(s).residue).toBe(1);
    if(s.plots[0].crop)M.remove(s,0);
    s.seeds.radish=1;M.plant(s,0,'radish');M.remove(s,0);
    expect(M.composterStatus(s).residue).toBe(1);
  });
  it('离线期间最多暂存两份，满仓暂停；领取后从当前时间继续', () => {
    const s=built();s.composter={purchasedAt:0,residue:6,stock:0,nextReady:12};s.now=100;
    expect(M.composterStatus(s)).toMatchObject({phase:'full',stock:2,residue:3,remaining:0});
    expect(M.collectCompost(s)).toBe(2);
    expect(M.composterStatus(s)).toMatchObject({phase:'working',stock:0,residue:0,remaining:12});
    s.now=111;expect(M.collectCompost(s)).toBe(0);s.now=112;expect(M.collectCompost(s)).toBe(1);
  });
  it('新采收的残枝不能追溯补足过去的批次，未完工和非法参数不领取', () => {
    const s=built();s.composter={purchasedAt:0,residue:2,stock:0,nextReady:12};s.now=100;
    reap(s,'radish');expect(M.composterStatus(s)).toMatchObject({stock:1,residue:0,remaining:12});
    expect(()=>command(s,'collectCompost',[999])).toThrow();
    const ready=built();ready.composter.stock=1;const result=command(ready,'collectCompost');
    expect(result.result).toBe(1);expect(result.pointsDelta).toBe(0);expect(result.state.fertilizers.eco).toBe(1);
    expect(command(result.state,'collectCompost').result).toBe(0);
    const empty=built();expect(command(empty,'collectCompost').pointsDelta).toBe(0);
    expect(command(empty,'collectCompost').result).toBe(0);
  });
  it('旧箱按一级读取而不改存档；升级受等级、报价、余额和当前箱体限制', () => {
    const s=built();delete s.composter.level;const old=structuredClone(s.composter);
    expect(M.composterStatus(s)).toMatchObject({level:1,hours:12,storage:2});
    expect(s.composter).toEqual(old);
    const plan={level:2,cost:180};
    expect(command(s,'upgradeComposter',[plan]).result).toBe(false);
    s.xp=M.RULES.levels[19];s.wallet=179;
    expect(command(s,'upgradeComposter',[plan]).pointsDelta).toBe(0);
    s.wallet=1000;
    expect(command(s,'upgradeComposter',[{...plan,cost:1}]).result).toBe(false);
    expect(command(s,'upgradeComposter',[{level:3,cost:360}]).result).toBe(false);
    s.casting=true;expect(M.upgradeComposter(s,plan)).toBe(false);s.casting=false;
    const missing=structuredClone(s);missing.composter=null;
    expect(command(missing,'upgradeComposter',[plan]).result).toBe(false);
    expect(()=>command(s,'upgradeComposter',[{level:2,cost:NaN}])).toThrow();
    expect(()=>command(s,'upgradeComposter',[])).toThrow();
  });
  it('升级消费同一积分，旧报价不能连续升级；满级不重复扣费', () => {
    const s=built();s.xp=M.RULES.levels[19];s.wallet=1000;
    const second=command(s,'upgradeComposter',[{level:2,cost:180}]);
    expect(second.pointsDelta).toBe(-180);
    expect(M.composterStatus(second.state)).toMatchObject({level:2,hours:12,storage:2,fertilizer:'nourish'});
    expect(command(second.state,'upgradeComposter',[{level:2,cost:180}]).pointsDelta).toBe(0);
    const third=command(second.state,'upgradeComposter',[{level:3,cost:360}]);
    expect(third.pointsDelta).toBe(-360);
    expect(M.composterStatus(third.state)).toMatchObject({level:3,hours:12,storage:2,fertilizer:'fertile'});
    expect(command(third.state,'upgradeComposter',[{level:3,cost:360}]).pointsDelta).toBe(0);
  });
  it('升级只提高品质，库存保留原品质，在制批次保持截止时间', () => {
    const s=built();s.xp=M.RULES.levels[19];s.wallet=1000;s.now=100;
    s.composter={level:1,purchasedAt:0,residue:2,stock:1,nextReady:106};
    expect(M.upgradeComposter(s,{level:2,cost:180})).toBe(true);
    expect(s.composter).toMatchObject({level:2,residue:2,stock:1,nextReady:106,stockByFertilizer:{eco:1}});
    s.now=105.99;expect(M.composterStatus(s).stock).toBe(1);
    s.now=106;expect(M.collectCompost(s)).toBe(2);
    expect(s.fertilizers.eco).toBe(1);expect(s.fertilizers.nourish).toBe(1);
    expect(M.collectCompost(s)).toBe(0);expect(s.composter.residue).toBe(2);
  });
  it('升级不增产、不扩仓，离线已完成批次不追溯升质', () => {
    const s=built();s.xp=M.RULES.levels[19];s.wallet=1000;s.now=100;
    s.composter={purchasedAt:0,residue:30,stock:0,nextReady:12};
    expect(M.upgradeComposter(s,{level:2,cost:180})).toBe(true);
    expect(M.composterStatus(s)).toMatchObject({level:2,stock:2,phase:'full',stored:{eco:2}});
    s.now=1000;expect(M.composterStatus(s)).toMatchObject({stock:2,phase:'full'});
    expect(M.collectCompost(s)).toBe(2);expect(s.fertilizers.eco).toBe(2);
    expect(M.composterStatus(s).remaining).toBe(12);
    s.now=1012;expect(M.collectCompost(s)).toBe(1);
    expect(s.fertilizers.nourish).toBe(1);
  });
  it('三级产出丰沃肥，仍为三份残枝、12 小时一份，混合库存原子领取', () => {
    const s=built();s.xp=M.RULES.levels[19];s.wallet=1000;s.now=100;
    M.upgradeComposter(s,{level:2,cost:180});M.upgradeComposter(s,{level:3,cost:360});
    s.composter.residue=0;s.composter.nextReady=112;s.now=112;
    expect(M.composterStatus(s)).toMatchObject({fertilizer:'fertile',stored:{fertile:1}});
    expect(M.collectCompost(s)).toBe(1);expect(s.fertilizers.fertile).toBe(1);
    s.composter.stock=2;s.composter.stockByFertilizer={eco:1,nourish:1};
    s.fertilizers.nourish=Number.MAX_SAFE_INTEGER;
    const before=structuredClone(s);
    expect(M.collectCompost(s)).toBe(0);expect(s).toEqual(before);
  });

});

describe('水族赎回按出售时的明确报价结算', () => {
  const sold = () => {
    const s=adopted();M.addFish(s,'blue');s.firstCompanionPending=null;
    const price=M.sell(s,s.fish[0].id,F);return {s,price,receipt:s.buybacks[0]};
  };
  it('加收 10% 向上取整且至少 1 积分，消费真实积分并恢复原个体', () => {
    for(const [price,cost] of [[2,3],[5,6],[12,14],[30,33]])expect(M.buybackPrice(price)).toBe(cost);
    const {s,price,receipt}=sold(),cost=M.buybackPrice(price);
    expect(receipt.buybackPoints).toBe(cost);
    const result=command(s,'buyback',[receipt.id,cost]);
    expect(result.pointsDelta).toBe(-cost);expect(result.state.fish[0].id).toBe(receipt.fish.id);
    expect(command(result.state,'buyback',[receipt.id,cost]).pointsDelta).toBe(0);
  });
  it('旧客户端缺报价、错误报价、余额不足和超时均不扣分不恢复', () => {
    const {s,receipt}=sold();
    for(const args of [[receipt.id],[receipt.id,receipt.points]]) {
      const r=command(s,'buyback',args);expect(r.result).toBeNull();expect(r.pointsDelta).toBe(0);
    }
    expect(command(s,'buyback',[receipt.id,receipt.buybackPoints],context({points:receipt.buybackPoints-1})).result).toBeNull();
    s.now+=M.RULES.buybackHours;expect(M.buyback(s,receipt.id,F,receipt.buybackPoints)).toBeNull();
  });
  it('历史出售记录维持原价，旧的单参数请求仍兼容', () => {
    const {s,receipt}=sold();delete receipt.buybackPoints;
    expect(M.buybackCost(receipt)).toBe(receipt.points);
    expect(command(s,'buyback',[receipt.id]).pointsDelta).toBe(-receipt.points);
  });
});
