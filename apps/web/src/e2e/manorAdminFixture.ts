import { createManor, executeManorCommand, manorModel as M, MANOR_VERSION } from '@lightnote/shared/manor';
import type {
  ManorRuntime,
  ManorOperation,
  ManorPlayer,
  ManorPlayerRow,
  ManorOverview,
  ManorEarner,
} from '@/api/manorAdminApi';

export function createManorAdminFixture() {
  const runtime: ManorRuntime = {
    mode: 'open',
    message: '庄园正在维护，已有进度会保留，请稍后再来。',
    revision: 1,
    deploymentEnabled: true,
    audience: 'internal',
    updatedAt: '2026-10-29T06:30:00Z',
    updatedBy: 'root_fixture',
    coverageStartedAt: '2026-10-23T00:00:00+08:00',
    rules: { version: MANOR_VERSION, dailyWater: 20, freeCasts: 3, pityCasts: 5, targetWeight: 4 },
  };
  const names = ['春风', '薄荷', '松果', '远山', '晴川', '小满', '一位昵称特别长、用来检查换行与截断的庄园示例玩家'];
  const players: ManorPlayerRow[] = Array.from({ length: 86 }, (_, i) => ({
    userId: `u_demo_${String(i + 1).padStart(3, '0')}`,
    alias: names[i] || `示例玩家 ${i + 1}`,
    level: [8, 6, 3, 6, 2, 1][i % 6],
    discoveries: [27, 19, 8, 21, 5, 1][i % 6],
    revision: 126 - i,
    updatedAt: `2026-10-29 14:${String(32 - (i % 30)).padStart(2, '0')}:00`,
  }));
  const ops: ManorOperation[] = players.slice(0, 6).map((p, i) => ({
    userId: p.userId,
    alias: p.alias,
    requestId: `mnr_demo_request_${i + 1}`,
    action: ['sellCrop', 'buyBait', 'claimDailyWater', 'buyFacility', 'plant', 'pickBirdSeed'][i],
    effectful: true,
    deltas: [
      {
        key: ['crops:radish', 'bait', 'water', 'facility:beehive', 'seeds:radish', 'seeds:radish'][i],
        delta: [-4, 1, 5, 1, -1, 1][i],
      },
    ],
    pointsDelta: [12, -8, 0, -160, 0, 0][i],
    revision: p.revision,
    version: MANOR_VERSION,
    createdAt: p.updatedAt,
  }));
  // 含阈值两侧（401 标记、400 不标记）、零收入与净额为负的账号。
  const earners: ManorEarner[] = [
    { index: 1, income: 620, spent: 140 },
    { index: 6, income: 421, spent: 20 },
    { index: 0, income: 400, spent: 0 },
    { index: 3, income: 260, spent: 75 },
    { index: 2, income: 180, spent: 160 },
    { index: 4, income: 0, spent: 30 },
  ].map(({ index, income, spent }) => ({
    userId: players[index].userId,
    alias: players[index].alias,
    income,
    spent,
    net: income - spent,
    flagged: income - spent > 400,
  }));
  function player(id: string): ManorPlayer {
    const row = players.find((p) => p.userId === id) || players[0];
    const ctx = {
      now: new Date('2026-10-29T06:35:00Z'),
      calendar: { dayKey: '20261029', weekKey: '202644', utcOffsetMinutes: 480 },
      points: 328,
      random: () => 0,
    };
    const s = executeManorCommand(createManor(ctx), { action: 'adopt', args: [] }, ctx).state;
    Object.assign(s, {
      xp: M.RULES.levels[7],
      guide: null,
      water: 40,
      seeds: { radish: 5, tomato: 4, carrot: 3 },
      fertilizers: { rabbit: 2, eco: 3, nourish: 2, fertile: 0, legend: 0 },
      workshop: { job: null },
      beehive: { pollen: 3 },
      purifier: { level: 1 },
      bait: 2,
      rainbowBait: 1,
    });
    for (const [index, key] of ['radish', 'tomato', 'strawberry', 'carrot'].entries()) {
      s.seeds[key] = Math.max(s.seeds[key] || 0, 1);
      M.plant(s, index, key);
      if (index < 3) M.water(s, [index]);
    }
    s.plots[0].next = s.now - 1;
    s.water = 40;
    s.seeds = { radish: 5, tomato: 4, carrot: 3 };
    s.fish = [
      { id: 1, kind: 'clown' },
      { id: 2, kind: 'blue' },
      { id: 3, kind: 'pearl' },
      { id: 4, kind: 'clown' },
    ];
    s.fishSlots = [{ fishId: 1 }, { fishId: 2 }, { fishId: 3 }, { fishId: 4 }, null, null];
    return {
      userId: id,
      alias: row.alias,
      revision: row.revision,
      version: MANOR_VERSION,
      points: 328,
      snapshotAt: '2026-10-29T06:35:20Z',
      level: 8,
      state: s,
      plots: s.plots.map((p, i) => ({
        crop: typeof p.crop === 'string' ? p.crop : null,
        status: M.plotState(s, i),
        remaining: M.remaining(s, i),
      })),
      facilities: {
        workshop: M.workshopStatus(s),
        beehive: M.beehiveStatus(s),
        composter: M.composterStatus(s),
        purifier: M.purifierStatus(s),
      },
    };
  }
  function overview(): ManorOverview {
    return {
      range: { days: 7, start: '2026-10-23 00:00:00', end: '2026-10-30 00:00:00', hideInternal: true },
      runtime: structuredClone(runtime),
      opened: 86,
      finances: {
        issued: 1260,
        spent: 1820,
        trend: [160, 180, 170, 190, 160, 200, 200].map((issued, i) => ({
          day: `2026-10-${23 + i}`,
          issued,
          spent: [210, 240, 260, 280, 230, 300, 300][i],
        })),
      },
      activity: { all: 28, plant: 22, fish: 19, resource: 24 },
      earners: { windowDays: 7, since: '2026-10-22 14:35:00', threshold: 400, items: structuredClone(earners) },
      recent: ops.slice(0, 5),
      failures: [],
    };
  }
  return { runtime, players, ops, player, overview };
}
