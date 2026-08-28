// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('标签空间交互契约', () => {
  it('详情内容由专用跨类型时间线接口加载，并支持两种明确排序', () => {
    const source = read('view/tagDetail/TagDetail.vue');
    expect(source).toContain('fetchTagSpaceResources');
    expect(source).not.toContain('fetchGlobalSearch');
    expect(source).toContain("{ value: 'updated', label: t('tagSpace.sortByUpdated') }");
    expect(source).toContain("{ value: 'added', label: t('tagSpace.sortByAdded') }");
    expect(source).toContain('watch([activeType, resourceSort, resourceKeyword]');
  });

  it('资源数量只用于展示，筛选值始终使用稳定的资源类型', () => {
    const source = read('view/tagDetail/TagDetail.vue');
    expect(source).toContain('...overviewMetrics.value.map((metric) => ({');
    expect(source).toContain('value: metric.key');
    expect(source).toContain('count: metric.value');
  });

  it('移动端不显示局部搜索，只保留共享顶栏的全局搜索', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const index = read('components/tagSpace/TagSpaceIndex.vue');
    expect(detail).toMatch(/<BInput\s+v-if="!bookmark\.isMobile"/u);
    expect(index).toMatch(/<BInput\s+v-if="!bookmark\.isMobile"/u);
    expect(index).toContain("searchSourceType: 'tag'");
  });

  it('只读代看不暴露管理和编辑入口，空标签提供双向引导', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const index = read('components/tagSpace/TagSpaceIndex.vue');
    const route = read('view/manage/TagMg.vue');
    expect(detail).toContain('v-if="tag && !isReadOnly"');
    expect(index).toContain('onlyEmptyTags && !isReadOnly');
    expect(index).toContain("t('tagSpace.addTagsToContent')");
    expect(route).toContain("user.adminContext?.mode !== 'readonly'");
  });

  it('表单、下拉与气泡均复用 B 系列组件', () => {
    const source = `${read('view/tagDetail/TagDetail.vue')}\n${read('components/tagSpace/TagSpaceIndex.vue')}`;
    expect(source).not.toMatch(/<(input|select)\b/iu);
    expect(source).toContain('<BInput');
    expect(source).toContain('<BSelect');
    expect(source).toContain('<BTooltip');
  });
});
