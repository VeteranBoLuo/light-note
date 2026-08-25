import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
import AiSkillResultContent from './AiSkillResultContent.vue';

type SkillResult = NonNullable<AiSkillResponse['result']>;
const componentSource = readFileSync(
  resolve(process.cwd(), 'src/components/aiSkills/AiSkillResultContent.vue'),
  'utf8',
);

let cleanup: (() => void) | undefined;

function mountResult(result: SkillResult) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AiSkillResultContent, { result }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          aiSkills: {
            draftTitle: 'AI 草稿',
            textResult: 'AI 结果',
            fieldSuggestions: '识别结果',
            unsupportedResult: '不支持展示',
            fields: { url: '网址', name: '名称', description: '描述', newTags: '建议标签' },
            todo: {
              draft: '待办草稿',
              breakdown: '待办拆解草稿',
              candidates: '待办候选',
              candidateCount: '共 {count} 项，仅供检查，不会自动创建',
              priority: '优先级',
              dueAt: '截止时间',
              noDueAt: '未设置',
              checklist: '清单',
              sourceCitation: '来源 [{index}]',
              priority0: '低',
              priority1: '普通',
              priority2: '高',
            },
          },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('AiSkillResultContent', () => {
  it('长标题与复杂 Markdown 使用共享内容边界，不继承会撑出结果卡片的全局标题样式', () => {
    const title = '轻笺书签图标加载策略演进：从直连接口到静态托管的三次关键升级'.repeat(3);
    const host = mountResult({
      kind: 'grounded_markdown',
      content: `# ${title}\n\nhttps://example.com/${'very-long-segment'.repeat(12)}\n\n| 字段 | 内容 |\n| --- | --- |\n| 长值 | ${'unbroken'.repeat(20)} |`,
    });

    expect(host.querySelector('h1')?.textContent).toBe(title);
    expect(host.querySelector('table')).not.toBeNull();
    expect(componentSource).toMatch(/\.ai-skill-result__markdown\s*\{[\s\S]*?max-width:\s*100%/);
    expect(componentSource).toMatch(/:deep\(h1\)[\s\S]*?font-size:\s*clamp\(/);
    expect(componentSource).toMatch(/:deep\(pre\)[\s\S]*?white-space:\s*pre-wrap/);
    expect(componentSource).toMatch(/:deep\(table\)[\s\S]*?table-layout:\s*fixed/);
  });

  it('把单条待办结构化草稿呈现为可读预览，不暴露原始 JSON', () => {
    const host = mountResult({
      kind: 'structured_draft',
      draftType: 'todo',
      title: '提交周报',
      description: '整理本周进展',
      priority: 2,
      dueAt: '2026-08-24 16:00:00',
      checklist: ['汇总数据', '发送邮件'],
      writeCommitted: false,
    });

    expect(host.textContent).toContain('待办草稿');
    expect(host.textContent).toContain('提交周报');
    expect(host.textContent).toContain('优先级高');
    expect(host.textContent).toContain('汇总数据');
    expect(host.textContent).not.toContain('writeCommitted');
  });

  it('清晰列出材料中提取的多个待办候选及其来源', () => {
    const host = mountResult({
      kind: 'structured_draft',
      draftType: 'todo_candidates',
      candidates: [
        { title: '提交周报', description: '', priority: 1, dueAt: null, sourceCitation: 1 },
        { title: '更新文档', description: '补充部署步骤', priority: 0, dueAt: null, sourceCitation: 2 },
      ],
      writeCommitted: false,
    });

    expect(host.querySelectorAll('.ai-skill-result__candidates > li')).toHaveLength(2);
    expect(host.textContent).toContain('共 2 项，仅供检查，不会自动创建');
    expect(host.textContent).toContain('来源 [2]');
  });

  it('字段建议只展示用户可理解的字段，不展示内部标签 ID', () => {
    const host = mountResult({
      kind: 'field_suggestions',
      fields: {
        url: 'https://example.com',
        name: '示例站点',
        description: '示例描述',
        matchedTagIds: ['internal-tag-id'],
        newTags: ['资料'],
      },
    });

    expect(host.textContent).toContain('示例站点');
    expect(host.textContent).toContain('资料');
    expect(host.textContent).not.toContain('internal-tag-id');
  });

  it('未知结构采用封闭式提示，不把任意对象序列化到页面', () => {
    const host = mountResult({ kind: 'structured_draft', draftType: 'future_type', secret: 'should-not-render' });
    expect(host.textContent).toContain('不支持展示');
    expect(host.textContent).not.toContain('should-not-render');
  });
});
