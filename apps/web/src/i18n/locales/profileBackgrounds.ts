import { PROFILE_BACKGROUND_IDS } from '@lightnote/shared/profile-backgrounds';
export const profileBackgroundsZh = {
  shared: '名片与主页共用',
  title: '个人背景',
  animated: '动态',
  subtitle: '兑换一次，社区名片与公开主页共用；永久拥有，随时切换。',
  change: '更换背景',
  preview: '预览',
  previewTitle: '背景预览',
  card: '社区名片',
  page: '公开主页',
  default: '默认背景',
  restore: '恢复默认',
  using: '使用中',
  owned: '已拥有',
  permanent: '永久拥有',
  use: '使用背景',
  used: '已同步应用到社区名片与公开主页',
  restored: '已恢复默认背景',
  redeem: '{n} 积分兑换',
  confirm: '使用 {n} 积分兑换「{name}」？永久拥有，社区名片与公开主页共用。兑换后可选择使用。',
  purchased: '兑换成功，点击“使用背景”即可同步应用到两处',
  previewHint: '两处使用同一背景，图片会随容器比例自动裁切。',
  previewName: '你的昵称',
  previewBio: '在轻笺，记录生活与灵感。',
  background_mountains: '纸上青山',
  background_sky: '晴空来信',
  background_coast: '落日海岸',
  background_stars: '灵感星图',
  background_mountainsDescription: '一页轻笺，展开青山。纸页折角与水墨层次，静态呈现。',
  background_skyDescription: '把灵感寄往晴空。蜡封信笺、折纸飞燕、书签与花瓣，叠成一封立体来信。',
  background_coastDescription: '翻开笔记，让灵感有岸可泊。灯塔缓缓扫光，海面泛起金色流光。',
  background_starsDescription: '把笺纸、收藏卡与书签连成星图。金色星轨流光、晶核折光与层叠星辉。',
};
export const profileBackgroundsEn = {
  shared: 'Shared by card and profile',
  title: 'Profile backgrounds',
  animated: 'Animated',
  subtitle: 'Redeem once for your community card and public profile. Keep forever and switch anytime.',
  change: 'Change background',
  preview: 'Preview',
  previewTitle: 'Background preview',
  card: 'Community card',
  page: 'Public profile',
  default: 'Default background',
  restore: 'Restore default',
  using: 'In use',
  owned: 'Owned',
  permanent: 'Yours forever',
  use: 'Use background',
  used: 'Applied to your community card and public profile',
  restored: 'Default background restored',
  redeem: 'Redeem for {n} points',
  confirm:
    'Redeem “{name}” for {n} points? Keep it forever for both your community card and public profile. You can equip it after redeeming.',
  purchased: 'Redeemed. Select “Use background” to apply it to both places.',
  previewHint: 'Both places share one background. Cropping adapts to the available space.',
  previewName: 'Your nickname',
  previewBio: 'Capture life and inspiration with Light Note.',
  background_mountains: 'Mountains on Paper',
  background_sky: 'Letter from the Sky',
  background_coast: 'Sunset Coast',
  background_stars: 'Inspiration Atlas',
  background_mountainsDescription:
    'Mountains unfold from a page. Quiet ink washes and layered paper, without animation.',
  background_skyDescription:
    'Send inspiration into the sky. A wax-sealed letter, origami swallows, bookmarks and petals form a layered paper sculpture.',
  background_coastDescription:
    'A lighthouse rises from an open notebook, sweeping light slowly across a sea of golden reflections.',
  background_starsDescription:
    'Notes, collected cards and bookmarks form a constellation, with golden orbit lights, a luminous crystal and layered starlight.',
};

export const profileBackgroundItemsZh = Object.fromEntries(
  PROFILE_BACKGROUND_IDS.map((id) => [id, { name: profileBackgroundsZh[id], desc: profileBackgroundsZh.subtitle }]),
);
export const profileBackgroundItemsEn = Object.fromEntries(
  PROFILE_BACKGROUND_IDS.map((id) => [id, { name: profileBackgroundsEn[id], desc: profileBackgroundsEn.subtitle }]),
);
