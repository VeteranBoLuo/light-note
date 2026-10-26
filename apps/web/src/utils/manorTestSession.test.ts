import { afterEach, describe, expect, it } from 'vitest';
import { createManor, executeManorCommand, MANOR_VERSION, type ManorContext, type ManorSnapshot } from '@lightnote/shared/manor';
import { createManorTestSession, readManorTestSession, saveManorTestSession } from './manorTestSession';
const context: ManorContext & {random:()=>number} = {now:new Date('2026-10-25T10:00:00Z'),points:320,calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480},random:()=>0};
const formal=():ManorSnapshot=>({version:MANOR_VERSION,revision:8,quests:[{key:'checkin',done:true},{key:'daily_note',done:true},{key:'daily_bookmark',done:false}],state:executeManorCommand(createManor(context),{action:'adopt',args:[]},context).state});
describe('Root 独立庄园流程测试',()=>{
  afterEach(() => sessionStorage.clear());
  it('刷新继续测试中的小萝卜、浇水和真实生长时间，不跳回正式玉米存档',()=>{
    let now=1000;
    const real=formal(),before=structuredClone(real),session=createManorTestSession(real,()=>now,()=>0);
    session.execute('adopt',[]);session.execute('plant',[0,'radish']);
    const planted=session.execute('water',[[0]]);
    saveManorTestSession('root',session);
    now+=60_000;
    const restored=readManorTestSession('root',()=>now,()=>0)!;
    expect(restored.snapshot().state.plots[0]).toMatchObject({crop:'radish'});
    expect(restored.snapshot().state.now-planted.state.now).toBeCloseTo(1/60);
    expect(restored.snapshot().revision).toBe(3);
    expect(restored.snapshot().state.guide).toBe(planted.state.guide);
    expect(real).toEqual(before);
    expect(readManorTestSession('other',()=>now)).toBeNull();
    saveManorTestSession('root',null);
    expect(readManorTestSession('root',()=>now)).toBeNull();
  });
  it('忽略损坏或旧版本测试存档，存储不可用时不影响游戏命令',()=>{
    sessionStorage.setItem('lightnote-manor-test-v1:root','{"version":"old"}');
    expect(readManorTestSession('root')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    const blocked={getItem(){throw Error('blocked');},removeItem(){throw Error('blocked');},setItem(){throw Error('blocked');}} as unknown as Storage;
    const session=createManorTestSession(formal(),()=>1000);
    expect(()=>saveManorTestSession('root',session,blocked)).not.toThrow();
    expect(readManorTestSession('root',()=>1000,()=>0,blocked)).toBeNull();
    expect(session.execute('adopt',[]).state.adopted).toBe(true);
  });
  it('重新开始引导，测试消费使用同一规则而不改正式存档、正式余额或操作收据',()=>{
    const real=formal(),before=structuredClone(real),session=createManorTestSession(real,()=>1000,()=>0);
    expect(session.snapshot().state).toMatchObject({adopted:false,water:0,wallet:320});
    session.execute('adopt',[]);
    const buy=session.execute('buySeed',['radish',1]);
    expect(buy.state.wallet).toBeLessThan(320);
    expect(buy.revision).toBe(2);
    expect(real).toEqual(before);
    expect(createManorTestSession(real,()=>1000).snapshot().state.adopted).toBe(false);
  });
  it('失败操作不推进测试存档，读取快照也不能旁路修改状态',()=>{
    const session=createManorTestSession(formal(),()=>1000),snapshot=session.snapshot();
    snapshot.state.wallet=999;
    expect(session.snapshot().state.wallet).toBe(320);
    expect(()=>session.execute('buySeed',['radish',1])).toThrow();
    expect(session.snapshot().revision).toBe(0);
  });
});
