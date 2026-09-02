import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/knowledgeBase/KnowledgeBase.vue'), 'utf8');

describe('知识库帮助栏目编辑契约', () => {
  it('只在帮助中心分类下显示可自由维护的 BInput 栏目字段', () => {
    expect(source).toContain('v-if="isHelpCenterArticle"');
    expect(source).toContain('v-model:value="editHelpSection"');
    expect(source).toContain('class="kb-help-section-input"');
    expect(source).toContain("editCategory.value.trim() === '帮助中心'");
    expect(source).not.toContain('<input');
  });

  it('新建、读取和更新均携带 helpSection，空栏目有稳定兜底', () => {
    expect(source).toContain("editHelpSection.value = res.data.helpSection || '其他帮助'");
    expect(source).toContain("editHelpSection.value = '其他帮助'");
    expect(source.match(/helpSection: isHelpCenterArticle\.value/g)).toHaveLength(2);
  });
});
