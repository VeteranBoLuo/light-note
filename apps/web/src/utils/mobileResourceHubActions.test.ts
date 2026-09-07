import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import icon from '@/config/icon';
import { createMobileResourceHubActions, mobileResourceHubPath } from './mobileResourceHubActions';

describe('移动资料共享入口', () => {
  it('按资源中心、整理中心顺序复用统一图标和无筛选路由', () => {
    const actions = createMobileResourceHubActions((key) => key);
    expect(actions).toEqual([
      { key: 'resource-center', label: 'navigation.resourceCenter', icon: icon.navigation.search },
      { key: 'organize-center', label: 'resourceCenter.sections.organize', icon: icon.ai.organize },
    ]);
    expect(mobileResourceHubPath('resource-center')).toBe('/search');
    expect(mobileResourceHubPath('organize-center')).toBe('/organize');
    expect(mobileResourceHubPath('unknown')).toBeNull();
  });

  it('书签、笔记、云空间和标签都接入共享入口，标签补齐更多抽屉', () => {
    const root = resolve(process.cwd(), 'src');
    const sources = [
      'view/home/Home.vue',
      'view/noteLibrary/NoteLibrary.vue',
      'components/cloudSpace/MobileCloudSpaceActionsDrawer.vue',
      'view/tagDetail/TagDetail.vue',
      'components/tagSpace/TagSpaceEntry.vue',
    ].map((file) => readFileSync(resolve(root, file), 'utf8'));
    for (const source of sources) expect(source).toContain('createMobileResourceHubActions');
    for (const source of sources.slice(3)) {
      expect(source).toContain('v-model:open="mobilePageActionsOpen"');
      expect(source).toContain('onAuxiliaryAction');
    }
  });
});
