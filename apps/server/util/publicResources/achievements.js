// 公开贡献是一条独立的一次性奖励线；积分为最终值，不参与旧成就的 C8 折半。
export const PUBLIC_RESOURCE_ACHIEVEMENTS = [
  { key: 'public_resource_1', target: 1, reward: 10 },
  { key: 'public_resource_10', target: 10, reward: 30 },
  { key: 'public_resource_50', target: 50, reward: 80 },
  { key: 'public_resource_200', target: 200, reward: 150 },
  { key: 'public_resource_500', target: 500, minLevel: 8, reward: 300 },
].map((item) => Object.freeze({
  ...item, group: 'sharing', metric: 'publicResourceCount', rewardPolicy: 'public-contribution-v1',
}));

export const PUBLIC_RESOURCE_FRAMES = [
  { id: 'frame_lantern_bearer', rarity: 'rare', name: '传灯者', desc: '头像框 · 五十份知识传递微光', achievementKey: 'public_resource_50' },
  { id: 'frame_shared_reading', rarity: 'epic', name: '共读之光', desc: '头像框 · 书页汇光，共享成林', achievementKey: 'public_resource_200' },
  { id: 'frame_knowledge_lighthouse', rarity: 'legendary', name: '知识灯塔', desc: '头像框 · 让分享成为温柔的指引', achievementKey: 'public_resource_500' },
].map((item) => Object.freeze({ ...item, type: 'cosmetic', effect: 'frame' }));
