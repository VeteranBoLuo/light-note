import { createHash, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { createKnowledgeManorService } from './knowledgeManorService.js';
import { knowledgeManorSchemaReady, migrateKnowledgeManorSchema } from './knowledgeManorSchema.js';
import { migrateKnowledgeManorAdminSchema } from './knowledgeManorAdminSchema.js';
import { MANOR_VERSION, manorModel as M, MANOR_SPECIES as F } from '@lightnote/shared/manor';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `manor_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('庄园真实积分与存档原子结算（隔离 MySQL）', () => {
  let admin, db, created = false, clock, failReceipt, facts, service, accountCalendar, roll;
  const input = (revision, action, args = [], requestId = randomUUID()) => ({ revision, action, args, requestId, version: MANOR_VERSION });
  const rows = async table => (await db.query(`SELECT * FROM ${table} ORDER BY user_id`))[0];
  const context = async (conn, owner, now) => {
    const [[row]] = await conn.query('SELECT points FROM user_growth WHERE user_id=?', [owner]);
    return { now, points: Number(row?.points || 0), calendar: accountCalendar, dailyDone: facts, quests: [] };
  };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Disposable socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
    await db.query('CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, points INT NOT NULL DEFAULT 0) ENGINE=InnoDB');
    await db.query(`CREATE TABLE points_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), delta INT,
      reason VARCHAR(32), ref VARCHAR(64), policy_version VARCHAR(32), meta JSON, KEY owner_reason_ref(user_id,reason,ref)) ENGINE=InnoDB`);
    await migrateKnowledgeManorSchema(db);
    await migrateKnowledgeManorSchema(db);
    await migrateKnowledgeManorAdminSchema(db);
    await migrateKnowledgeManorAdminSchema(db);
  });
  afterAll(async () => {
    await db?.end();
    try { if (created) await admin.query(`DROP DATABASE ${schema}`); }
    finally { await admin?.end(); }
  });
  beforeEach(async () => {
    for (const table of ['knowledge_manor_operations', 'knowledge_manors', 'points_log', 'user_growth']) await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO user_growth VALUES ('owner',60),('other',60)");
    clock = new Date('2026-10-24T02:00:00Z'); facts = [false, false, false]; failReceipt = false; roll = 0;
    accountCalendar = { dayKey:'20261024',weekKey:'202643',utcOffsetMinutes:480 };
    const wrapped = { query: db.query.bind(db), getConnection: async () => {
      const conn = await db.getConnection();
      return {
        beginTransaction: () => conn.beginTransaction(), commit: () => conn.commit(), rollback: () => conn.rollback(), release: () => conn.release(),
        query: (sql, params) => {
          if (failReceipt && String(sql).startsWith('INSERT INTO knowledge_manor_operations')) throw new Error('fixture receipt failure');
          return conn.query(sql, params);
        },
      };
    } };
    service = createKnowledgeManorService({ db: wrapped, context, rng: () => roll, now: () => clock });
  });
  const adopt = async (owner = 'owner') => service.execute(owner, input(0, 'adopt'));

  it('显式结构安装可重入；读取未开通庄园不创建账号、存档或发放资产', async () => {
    expect(await knowledgeManorSchemaReady(db)).toBe(true);
    const before = await rows('user_growth');
    const s = await service.get('owner');
    expect(s).toMatchObject({ revision: 0, state: { wallet: 60, adopted: false, seeds: {} } });
    expect(await rows('knowledge_manors')).toEqual([]);
    expect(await rows('points_log')).toEqual([]);
    expect(await rows('user_growth')).toEqual(before);
  });
  it('购买与主站积分同余额，存档不另存可漂移的钱包', async () => {
    await adopt();
    const result = await service.execute('owner', input(1, 'buySeed', ['radish', 1]));
    expect(result.state.wallet).toBe(58);
    expect(result.state.seeds.radish).toBe(4);
    expect((await rows('user_growth')).find(r => r.user_id === 'owner').points).toBe(58);
    const stored = (await rows('knowledge_manors'))[0].state_json;
    expect((typeof stored === 'string' ? JSON.parse(stored) : stored).wallet).toBeUndefined();
    expect((await rows('points_log'))[0]).toMatchObject({ delta: -2, reason: 'manor_cost', policy_version: MANOR_VERSION });
  });
  it('结构门禁拒绝不支持回滚的存储引擎', async () => {
    try {
      await db.query('ALTER TABLE knowledge_manor_operations ENGINE=MyISAM');
      expect(await knowledgeManorSchemaReady(db)).toBe(false);
    } finally { await db.query('ALTER TABLE knowledge_manor_operations ENGINE=InnoDB'); }
    expect(await knowledgeManorSchemaReady(db)).toBe(true);
  });
  it('同一请求重试只扣一次，并返回原操作结果和最新主站余额', async () => {
    await adopt();
    const request = input(1, 'buySeed', ['radish', 2]);
    await service.execute('owner', request);
    await db.query("UPDATE user_growth SET points=points+10 WHERE user_id='owner'");
    const retry = await service.execute('owner', request);
    expect(retry).toMatchObject({ revision: 2, replayed: true, result: true, state: { wallet: 66, seeds: { radish: 5 } } });
    expect(await rows('points_log')).toHaveLength(1);
  });
  it('同账号并发购买的旧版本只有一个成功，不会透支或覆盖库存', async () => {
    await adopt();
    const results = await Promise.allSettled([service.execute('owner', input(1, 'buySeed', ['radish', 10])), service.execute('owner', input(1, 'buySeed', ['radish', 10]))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.code).toBe('MANOR_REVISION_CONFLICT');
    expect((await service.get('owner')).state).toMatchObject({ wallet: 40, seeds: { radish: 13 } });
  });
  it.each([
    {name:'麻雀种子',action:'pickBirdSeed',args:[],prepare:s=>M.deliverBirdSeed(s),check:s=>expect(s.seeds.radish).toBe(4)},
    {name:'兔子肥料',action:'pickPoop',args:[],prepare:()=>{},check:s=>expect(s.fertilizers.rabbit).toBe(1)},
    {name:'播种',action:'plant',args:[0,'radish'],prepare:()=>{},check:s=>{expect(s.seeds.radish).toBe(2);expect(s.plots[0].crop).toBe('radish');}},
    {name:'采摘',action:'harvest',args:[[0]],prepare:s=>{M.plant(s,0,'radish');M.water(s,[0]);s.plots[0].next=s.now-1;},check:s=>expect(s.crops.radish).toBe(1)},
    {name:'施肥',action:'fertilize',args:[0,'rabbit'],prepare:s=>{s.seeds.carrot=1;expect(M.plant(s,0,'carrot')).toBe(true);M.water(s,[0]);s.fertilizers.rabbit=1;},check:s=>{expect(s.fertilizers.rabbit).toBe(0);expect(s.plots[0].accel).toBe(0.5);}},
    {name:'养鱼收肥',action:'collect',args:[],prepare:s=>{M.addFish(s,'clown');M.place(s,1,0,F);s.fishSlots[0].started-=M.RULES.productionHours;},check:s=>expect(s.fertilizers[F.clown.fertilizer]).toBe(1)},
  ])('多端同时$name只结算一次；旧意图拒绝、原收据重放、重新点击均不重复发放',async({action,args,prepare,check})=>{
    const initial=await adopt(),state=structuredClone(initial.state);state.guide=null;state.xp=M.RULES.levels[7];
    prepare(state);delete state.wallet;
    await db.query("UPDATE knowledge_manors SET state_json=? WHERE user_id='owner'",[JSON.stringify(state)]);
    const requests=[input(1,action,args),input(1,action,args)];
    const results=await Promise.allSettled(requests.map(r=>service.execute('owner',r)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.find(r=>r.status==='rejected').reason).toMatchObject({code:'MANOR_REVISION_CONFLICT'});
    const winner=results.findIndex(r=>r.status==='fulfilled'),after=(await service.get('owner')).state;
    check(after);
    expect(await service.execute('owner',requests[winner])).toMatchObject({replayed:true,state:after});
    expect((await service.execute('owner',input(2,action,args))).state).toEqual(after);
    expect(await rows('points_log')).toEqual([]);
  });
  it('请求号不能换商品或伪造账号；不同账号同号不互相干扰', async () => {
    const request = input(0, 'adopt');
    await service.execute('owner', request);
    await expect(service.execute('owner', { ...request, action: 'buyBait', args: [1] })).rejects.toMatchObject({ code: 'MANOR_REQUEST_CONFLICT' });
    await expect(service.execute('owner', { ...input(1, 'buyBait', [1]), userId: 'other' })).rejects.toMatchObject({ code: 'MANOR_COMMAND_INVALID' });
    expect((await service.execute('other', request)).replayed).toBe(false);
    expect(await rows('knowledge_manors')).toHaveLength(2);
  });
  it('收据写入失败会回滚积分、库存、流水和版本；重试可成功', async () => {
    await adopt();
    const before = await service.get('owner');
    const request = input(1, 'buySeed', ['radish', 1]);
    failReceipt = true;
    await expect(service.execute('owner', request)).rejects.toThrow('fixture receipt failure');
    expect(await service.get('owner')).toEqual(before);
    expect(await rows('points_log')).toEqual([]);
    failReceipt = false;
    expect((await service.execute('owner', request)).state.wallet).toBe(58);
  });
  it('收获与出售沿用真实周期，重复出售不再次发放积分', async () => {
    await adopt();
    await service.execute('owner', input(1, 'plant', [0, 'radish']));
    await service.execute('owner', input(2, 'water', [[0]]));
    clock = new Date('2026-10-24T06:00:00Z');
    await service.execute('owner', input(3, 'harvest', [[0]]));
    const sale = input(4, 'sellAllCrops');
    const sold = await service.execute('owner', sale);
    expect(sold.state.wallet).toBe(63);
    expect((await service.execute('owner', sale)).state.wallet).toBe(63);
    expect((await rows('points_log')).filter(r => r.reason === 'manor_sale')).toHaveLength(1);
    expect((await service.execute('owner', input(5, 'sellAllCrops'))).state.wallet).toBe(63);
  });
  it('抛竿状态刷新可恢复，结果仅由服务端随机；重试不重抽或重复消耗次数', async () => {
    await adopt();
    const cast = input(1, 'beginCast', ['bait']);
    const started = await service.execute('owner', cast);
    const refreshed = await service.get('owner');
    expect(refreshed.state.castId).toBe(started.state.castId);
    expect((await service.execute('owner', cast)).state.freeUsed).toBe(1);
    const resolve = input(2, 'resolveCast', [started.state.castId]);
    const result = await service.execute('owner', resolve);
    expect(result.result.fish.kind).toBe('clown');
    const replay = await service.execute('owner', resolve);
    expect(replay.result).toEqual(result.result);
    expect(replay.state.fish).toHaveLength(1);
  });
  it('五竿保底随事务持久化，并发重放、刷新与跨日不重复推进', async () => {
    const initial=await adopt();
    const state={...initial.state,firstCastDone:true,bait:2};delete state.wallet;
    await db.query("UPDATE knowledge_manors SET state_json=? WHERE user_id='owner'",[JSON.stringify(state)]);
    roll=.3;
    let current=await service.get('owner');
    for(let i=0;i<5;i++) {
      const started=await service.execute('owner',input(current.revision,'beginCast',['bait']));
      const request=input(started.revision,'resolveCast',[started.state.castId]);
      const results=await Promise.all([service.execute('owner',request),service.execute('owner',request)]);
      expect(results.filter(r=>r.replayed)).toHaveLength(1);
      expect(results[0].result).toEqual(results[1].result);
      current=await service.get('owner');
      expect(current.state.emptyCastStreak).toBe(i===4?0:i+1);
      expect(Boolean(results[0].result.fish)).toBe(i===4);
      if(i===2) {
        clock=new Date('2026-10-25T02:00:00Z');
        accountCalendar={dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:480};
        current=await service.get('owner');
        expect(current.state).toMatchObject({emptyCastStreak:3,freeUsed:0});
      }
    }
    expect(current.state.fish).toHaveLength(1);
    expect(current.revision).toBe(11);
    expect(await rows('knowledge_manor_operations')).toHaveLength(11);
    expect(await rows('points_log')).toEqual([]);
  });
  it('旧版本成功收据仍重放原结果，读取升级不写存档、不补种子或改库存', async () => {
    const request=input(0,'adopt'),created=await service.execute('owner',request);
    const old={...created.state,version:'knowledge-manor-v1',seeds:{radish:7}};
    delete old.emptyCastStreak;delete old.wallet;
    old.rewards['daily-pack:20261024']=old.now;
    await db.query("UPDATE knowledge_manors SET state_json=? WHERE user_id='owner'",[JSON.stringify(old)]);
    const legacy={...request,version:'knowledge-manor-v1'};
    const hash=createHash('sha256').update(JSON.stringify({version:legacy.version,action:legacy.action,args:legacy.args})).digest('hex');
    await db.query("UPDATE knowledge_manor_operations SET command_hash=?,model_version='knowledge-manor-v1' WHERE request_id=?",[hash,request.requestId]);
    facts=[true,true,true];
    const replay=await service.execute('owner',legacy);
    expect(replay).toMatchObject({version:MANOR_VERSION,revision:1,replayed:true,result:true,state:{version:MANOR_VERSION,emptyCastStreak:0,seeds:{radish:7}}});
    const [stored]=(await rows('knowledge_manors'));
    expect(typeof stored.state_json==='string'?JSON.parse(stored.state_json):stored.state_json).toEqual(old);
    await expect(service.execute('owner',{...input(1,'claimAllDailyWater'),version:'knowledge-manor-v1'})).rejects.toMatchObject({code:'MANOR_VERSION_UNSUPPORTED'});
    const claimed=await service.execute('owner',input(1,'claimAllDailyWater'));
    expect(claimed.state.seeds).toEqual({radish:7});
    expect(claimed.state.water).toBe(50);
    expect((await rows('knowledge_manor_operations'))).toHaveLength(2);
  });
  it('v2 当天已领十五滴只补五滴，并发和重试不重复发放或变更主站积分', async () => {
    const adopted=await adopt(),old={...adopted.state,version:'knowledge-manor-v2',water:35,dailyWaterClaims:[5,5,5],emptyCastStreak:3};
    delete old.dailyWaterBonusClaimed;delete old.wallet;
    await db.query("UPDATE knowledge_manors SET state_json=? WHERE user_id='owner'",[JSON.stringify(old)]);
    facts=[true,true,true];
    expect((await service.get('owner')).state).toMatchObject({version:MANOR_VERSION,dailyWaterBonusClaimed:0,emptyCastStreak:3});
    const [row]=await rows('knowledge_manors');
    expect(typeof row.state_json==='string'?JSON.parse(row.state_json):row.state_json).toEqual(old);
    await expect(service.execute('owner',{...input(1,'claimDailyWaterBonus'),version:'knowledge-manor-v2'})).rejects.toMatchObject({code:'MANOR_VERSION_UNSUPPORTED'});
    const requests=[input(1,'claimDailyWaterBonus'),input(1,'claimAllDailyWater')];
    const results=await Promise.allSettled(requests.map(r=>service.execute('owner',r)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.find(r=>r.status==='rejected').reason).toMatchObject({code:'MANOR_REVISION_CONFLICT'});
    const winner=results.findIndex(r=>r.status==='fulfilled');
    expect(results[winner].value).toMatchObject({result:{water:5},state:{water:40,dailyWaterBonusClaimed:5,emptyCastStreak:3}});
    expect(await service.execute('owner',requests[winner])).toMatchObject({replayed:true,result:{water:5},state:{water:40}});
    expect((await service.execute('owner',input(2,'claimDailyWaterBonus'))).result).toBeNull();
    expect((await rows('user_growth')).find(r=>r.user_id==='owner').points).toBe(60);
    expect(await rows('points_log')).toEqual([]);
  });
  it('全完成水滴与收据同事务，提交失败后重试可正常领取一次', async () => {
    await adopt();facts=[true,true,true];
    const request=input(1,'claimDailyWaterBonus');failReceipt=true;
    await expect(service.execute('owner',request)).rejects.toThrow('fixture receipt failure');
    expect(await service.get('owner')).toMatchObject({revision:1,state:{water:30,dailyWaterBonusClaimed:0}});
    failReceipt=false;
    expect(await service.execute('owner',request)).toMatchObject({revision:2,result:{water:5},state:{water:35,dailyWaterBonusClaimed:5}});
    expect(await service.execute('owner',request)).toMatchObject({replayed:true,state:{water:35,dailyWaterBonusClaimed:5}});
  });
  it('空竿收据提交失败会回滚进度，同一请求重试只累计一次', async () => {
    const adopted=await adopt();
    const state={...adopted.state,firstCastDone:true};delete state.wallet;
    await db.query("UPDATE knowledge_manors SET state_json=? WHERE user_id='owner'",[JSON.stringify(state)]);
    const started=await service.execute('owner',input(1,'beginCast',['bait']));
    const request=input(2,'resolveCast',[started.state.castId]);roll=.9;failReceipt=true;
    await expect(service.execute('owner',request)).rejects.toThrow('fixture receipt failure');
    expect((await service.get('owner')).state).toMatchObject({emptyCastStreak:0,castPending:true});
    failReceipt=false;
    expect((await service.execute('owner',request)).state.emptyCastStreak).toBe(1);
    expect((await service.execute('owner',request)).state.emptyCastStreak).toBe(1);
  });
  it('麻雀掉落写入存档，其他操作和刷新不会抹掉礼物，领取每天仅一次', async () => {
    await adopt();
    await service.execute('owner', input(1, 'plant', [0, 'radish']));
    await service.execute('owner', input(2, 'water', [[0]]));
    expect((await service.execute('owner', input(3, 'deliverBirdSeed'))).result).toBe(true);
    await service.execute('owner', input(4, 'buySeed', ['radish', 1]));
    expect((await service.get('owner')).state.birdSeedDay).toBe(1);
    expect((await service.execute('owner', input(5, 'pickBirdSeed'))).state.seeds.radish).toBe(4);
    const again = await service.execute('owner', input(6, 'pickBirdSeed'));
    expect(again.result).toBe(false); expect(again.state.seeds.radish).toBe(4);
    expect(again.state.wallet).toBe(58);
  });
  it('64 字符合法请求号也能完整记账，不截断积分 ref', async () => {
    await adopt();
    const r = await service.execute('owner', input(1, 'buyBait', [1], 'r'.repeat(64)));
    expect(r.state.wallet).toBe(52);
    expect((await rows('points_log'))[0].ref).toHaveLength(64);
  });
  it('已用日期的额度随存档提交，切换时区并刷新后也不会重新发放', async () => {
    await adopt();
    await service.execute('owner',input(1,'plant',[0,'radish']));
    await service.execute('owner',input(2,'water',[[0]]));
    let revision=3;
    const run=async(action,args=[])=>{
      const result=await service.execute('owner',input(revision,action,args));
      revision=result.revision; return result;
    };
    clock=new Date('2026-10-24T12:00:00Z'); facts=[true,false,false];
    for(const calendar of [
      {dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:840},
      {dayKey:'20261024',weekKey:'202643',utcOffsetMinutes:-720},
    ]) {
      accountCalendar=calendar;
      await run('claimDailyWater',[0]); await run('pickPoop');
      const started=await run('beginCast',['bait']);
      const caught=await run('resolveCast',[started.state.castId]);
      if(caught.result.firstCatch) await run('place',[caught.result.fish.id,0]);
    }
    accountCalendar={dayKey:'20261025',weekKey:'202643',utcOffsetMinutes:840};
    expect((await service.get('owner')).state).toMatchObject({freeUsed:1,dailyWaterClaims:[5,0,0]});
    expect((await run('claimDailyWater',[0])).result).toBeNull();
    const result=await run('pickPoop');
    expect(result.result).toBe(false);
    expect(result.state).toMatchObject({wallet:60,water:35,fertilizers:{rabbit:2}});
  });
});
