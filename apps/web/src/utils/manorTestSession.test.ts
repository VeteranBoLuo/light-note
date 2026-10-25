import { describe, expect, it } from 'vitest';
import { createManor, executeManorCommand, MANOR_VERSION, type ManorContext, type ManorSnapshot } from '@lightnote/shared/manor';
import { createManorTestSession } from './manorTestSession';
const context: ManorContext & {random:()=>number} = {now:new Date('2026-10-25T10:00:00Z'),points:320,calendar:{dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480},random:()=>0};
const formal=():ManorSnapshot=>({version:MANOR_VERSION,revision:8,quests:[{key:'checkin',done:true},{key:'daily_note',done:true},{key:'daily_bookmark',done:false}],state:executeManorCommand(createManor(context),{action:'adopt',args:[]},context).state});
describe('Root 独立庄园流程测试',()=>{
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
