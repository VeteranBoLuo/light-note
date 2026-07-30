export type AiRecommendationIdentity = {
  role?: string;
  adminMode?: 'readonly' | 'maintain' | 'normal' | null;
};

const HELP_KEYS = {
  note: ['howToEditNote', 'quickNote', 'howToCreateTag'],
  cloud: ['cloudSpaceUsage', 'restoreTrash', 'howToImportExportBookmarks'],
  tag: ['howToCreateTag', 'bookmarkTagUsage', 'howToManageBookmarks'],
  workbench: ['workbenchUsage', 'howToCreateBookmark', 'cloudSpaceUsage'],
  inbox: ['workbenchUsage', 'howToManageBookmarks', 'howToEditNote'],
  default: ['howToCreateBookmark', 'cloudSpaceUsage', 'howToCreateTag'],
} as const;

const ACCOUNT_KEYS = {
  note: [
    'recentNoteDigest',
    'noteActionItems',
    'weeklyKnowledgeDigest',
    'myNotes',
    'weeklyRecap',
    'tagUsageOverview',
  ],
  cloud: [
    'storageUsage',
    'fileTypeOverview',
    'recentCloudFiles',
    'trashContent',
    'cloudFolderOverview',
    'weeklyKnowledgeDigest',
  ],
  tag: [
    'tagUsageOverview',
    'unusedTags',
    'recentKnowledgeDigest',
    'myTags',
    'weeklyKnowledgeDigest',
    'linkHealth',
  ],
  workbench: [
    'weeklyRecap',
    'weeklyChallengeStatus',
    'claimableGrowthRewards',
    'recentKnowledgeDigest',
    'linkHealth',
    'storageUsage',
  ],
  inbox: [
    'weeklyKnowledgeDigest',
    'noteActionItems',
    'linkHealth',
    'recentKnowledgeDigest',
    'unusedTags',
    'buriedRecap',
  ],
  default: [
    'weeklyKnowledgeDigest',
    'buriedRecap',
    'linkHealth',
    'recentKnowledgeDigest',
    'weeklyRecap',
    'tagUsageOverview',
  ],
} as const;

function pageKind(path: string): keyof typeof ACCOUNT_KEYS {
  if (path.includes('/noteLibrary')) return 'note';
  if (path.includes('/cloudSpace')) return 'cloud';
  if (path.includes('/tag')) return 'tag';
  if (path.includes('/workbenches')) return 'workbench';
  if (path.includes('/inbox')) return 'inbox';
  return 'default';
}

/**
 * 初始推荐只使用当前身份确实可执行的能力。服务端生成的追问仍会再按本轮
 * 实际工具、来源和权限过滤；这里负责避免游客收到“查询我的私有资源”等入口。
 */
export function recommendedQuestionKeys(path: string, identity: AiRecommendationIdentity): string[] {
  const kind = pageKind(path);
  if (!identity.role || identity.role === 'visitor') return [...HELP_KEYS[kind]];
  return [...ACCOUNT_KEYS[kind]];
}
