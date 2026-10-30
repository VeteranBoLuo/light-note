/** Only these runtime entry points may be fetched speculatively; dynamic imports stay demand-driven. */
export const PREWARM_RUNTIME_ENTRIES: Record<string, string> = {
  'editor.html': 'components/noteLibrary/detail/TinyMceEditorRuntime.vue',
  'editor.markdown': 'components/noteLibrary/detail/MarkdownCodeMirror.vue',
  'route.noteDetail': 'view/noteLibrary/NoteDetail.vue',
  'route.workbenches': 'view/workbenches/Workbenches.vue',
  'route.home': 'view/home/Home.vue',
  'route.bookmarkMg': 'view/manage/BookmarkMg.vue',
  'route.noteLibrary': 'view/noteLibrary/NoteLibrary.vue',
  'route.cloudSpace': 'view/cloudSpace/cloudSpace.vue',
  'route.tagMg': 'components/tagSpace/TagSpaceEntry.vue',
  'route.searchCenter': 'view/search/SearchCenter.vue',
  'route.support': 'view/support/SupportUs.vue',
  'route.entitlementStore': 'view/entitlementStore/EntitlementStore.vue',
  'route.campaign': 'view/campaign/CampaignPage.vue',
  'route.inbox': 'view/inbox/Inbox.vue',
  'route.communityChat': 'view/communityChat/CommunityChat.vue',
  'route.communityFeed': 'view/community/CommunityFeed.vue',
  'route.growth': 'view/growth/GrowthPage.vue',
  'route.personCenter': 'view/personCenter/PersonCenterMobile.vue',
  account: 'view/login/UserAuthModal.vue',
};

/** 全部构建代码按固定分片登记；仅在 Service Worker 已接管页面时于空闲补齐，持久缓存后切换模块无需再等下载。 */
export const CODE_PREWARM_GROUPS = ['code.1', 'code.2', 'code.3', 'code.4'] as const;
/** 与运行时清单校验的单组上限一致。 */
export const CODE_PREWARM_GROUP_SIZE = 500;
/** 与运行时 static-prewarm.json 的读取上限一致，超出时构建失败而不是线上静默停用预热。 */
export const PREWARM_MANIFEST_LIMIT = 256 * 1024;

/** Shared ordering across independent producers; smaller values run first. */
export const PREWARM_PRIORITY = {
  intent: -1,
  current: 0,
  browsing: 1,
  nearby: 2,
  detail: 3,
  extended: 4,
  decorative: 5,
} as const;
