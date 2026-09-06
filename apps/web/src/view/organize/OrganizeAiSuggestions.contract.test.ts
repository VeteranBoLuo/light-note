import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), `src/${path}`), 'utf8');
const component = read('view/organize/OrganizeAiSuggestions.vue');
const center = read('view/organize/OrganizeCenter.vue');
const api = read('api/organizeApi.ts');

describe('整理中心 AI 建议流契约', () => {
  it('仅在桌面整理中心出现，移动导航仍保持原有任务集合', () => {
    expect(center).toContain("activeView === 'ai_suggestions' && bookmark.isDesktop");
    expect(center).toMatch(/\.\.\.\(bookmark\.isDesktop[\s\S]*key: 'ai_suggestions'/);
    expect(component).not.toMatch(/@media \(max-width:/);
  });

  it('生成前只在批量成本决策点请求估算，批次创建后可恢复和轮询', () => {
    expect(api).toContain("'/api/organize/ai-suggestions/estimate'");
    expect(api).toContain("'/api/organize/ai-suggestions/batches'");
    expect(component).toContain('estimateOrganizeAiSuggestions');
    expect(component).toContain('createOrganizeAiSuggestionBatch');
    expect(component).toContain('getOrganizeAiSuggestionBatches');
    expect(component).toContain('getOrganizeAiSuggestionBatch');
    expect(component).toContain("new Set<OrganizeAiSuggestionBatchStatus>(['queued', 'running'])");
    expect(component).toContain('sessionStorage.removeItem(ORGANIZE_AI_SEED_KEY)');
    expect(component).toContain('if (resourceIds.length > 20) return null;');
    expect(component).not.toContain('pageSize: -1');
  });

  it('新建流程按需进入共享抽屉，审核区通过气泡切换批次', () => {
    expect(component).toContain('<BDrawer');
    expect(component).toContain(':open="createDrawerOpen"');
    expect(component).toContain('const createDrawerOpen = ref(Boolean(seed))');
    expect(component).toContain('<BPopover');
    expect(component).toContain('aria-haspopup="dialog"');
    expect(component).toContain('createDrawerOpen.value = false');
    expect(component).not.toContain('organize-ai-estimate-placeholder');
    expect(component).not.toContain('organize-ai-batch-layout');
  });

  it('书签与笔记可同时估算，每类复用自己的 requestId 避免部分重试重复计费', () => {
    expect(component).toContain(
      'const draftRequestIds = ref<Partial<Record<OrganizeAiSuggestionResourceType, string>>>({});',
    );
    expect(component).toContain(
      'if (!nextRequestIds[entry.resourceType]) nextRequestIds[entry.resourceType] = generateUUID();',
    );
    expect(component).toContain('const requestId = draftRequestIds.value[entry.resourceType] || generateUUID();');
    expect(component).toContain('!createdDraftTypes.value.has(entry.resourceType)');
    expect(component).toContain('Promise.allSettled');
    expect(component).not.toContain('requestId: generateUUID()');
    expect(component).toMatch(/function resetEstimate\(\)[\s\S]*?draftRequestIds\.value = \{\};/);
    expect(component).toMatch(/sessionStorage\.removeItem\(ORGANIZE_AI_SEED_KEY\)[\s\S]*?resetEstimate\(\);/);
  });

  it('建议逐条编辑、接受或忽略，冲突不会静默覆盖资源', () => {
    expect(component).toContain('<OrganizeSuggestionTagEditor');
    expect(component).toContain('acceptOrganizeAiSuggestion');
    expect(component).toContain('ignoreOrganizeAiSuggestion');
    expect(component).toContain("suggestion.status === 'conflict'");
    expect(component).toContain('if (Number(error?.status || error?.response?.status || 0) === 409');
    expect(component).not.toMatch(/<(?:input|select|textarea)\b/u);
    expect(component).toContain('v-model:tags="editingTags"');
    expect(component).toContain('<BButton');
    expect(component).toContain('class="organize-ai-choice"');
    expect(component).toContain(':aria-pressed="draftResourceTypes.includes(option.value)"');
    expect(component).toContain(':aria-pressed="draftScope === option.value"');
    expect(component).toContain("value: 'recent' as const");
    expect(component).toContain('editingTags.value.length <= 3');
    expect(component).not.toMatch(/parseTagNames[\s\S]{0,500}\.slice\(/);
  });

  it('标签复用标签语义，批次列表重置按钮行高并提供明确选中信号', () => {
    expect(component).toContain('<ResourceTagChip');
    expect(component).not.toContain('tone="bookmark"');
    expect(component).toContain('border-left-color: var(--primary-color)');
    expect(component).toContain('line-height: 1.45');
    expect(component).toContain('height: auto');
    expect(component).toContain('activeBatchId === batch.id');
  });
});
