import { describe, expect, it, vi } from 'vitest';
import {
  dedupeAgentSources,
  normalizeAgentSource,
  normalizeSourceUrl,
  resolveKnowledgeSourceTarget,
  resolveToolSources,
} from './sourceUtils.js';

describe('AI 来源标准化', () => {
  it('只接受 HTTP(S) 外链并清理展示文本', () => {
    expect(normalizeSourceUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeSourceUrl('javascript:alert(1)')).toBe('');
    expect(
      normalizeAgentSource({
        type: 'web',
        id: '',
        title: '<b>Example</b>',
        url: 'https://example.com/path',
        target: 'web-url',
      }),
    ).toEqual({
      type: 'web',
      id: 'https://example.com/path',
      title: 'Example',
      url: 'https://example.com/path',
      target: 'web-url',
    });
  });

  it('按稳定资源标识去重，不再把不同知识条目折叠到一起', () => {
    expect(
      dedupeAgentSources([
        { type: 'knowledge', id: 'kb-1', title: '文章一', target: 'help-article' },
        { type: 'knowledge', id: 'kb-2', title: '文章二', target: 'help-article' },
        { type: 'knowledge', id: 'kb-1', title: '文章一重复', target: 'help-article' },
      ]),
    ).toHaveLength(2);
  });

  it('云文档缺少真实 fileId 时保留静态来源，不把文档 ID 误当成文件 ID', () => {
    expect(
      normalizeAgentSource({
        type: 'document',
        id: 'document-id',
        title: '未完成保存的文件',
        sourceType: 'cloud',
        target: 'cloud-file',
      }),
    ).toEqual({
      type: 'document',
      id: 'document-id',
      title: '未完成保存的文件',
      sourceType: 'cloud',
    });
  });

  it('知识来源根据可见性与用户角色分配正确目标', () => {
    expect(resolveKnowledgeSourceTarget({ status: 'public', category: '帮助中心' }, 'user')).toBe('help-article');
    expect(resolveKnowledgeSourceTarget({ status: 'public', category: '使用指南' }, 'user')).toBe('public-knowledge');
    expect(resolveKnowledgeSourceTarget({ status: 'internal', category: '运维' }, 'root')).toBe('knowledge-admin');
    expect(resolveKnowledgeSourceTarget({ status: 'internal', category: '运维' }, 'user')).toBeUndefined();
  });

  it('统一读取工具声明的来源并隔离单个工具的提取异常', () => {
    const tool = {
      name: 'query_notes',
      sourceType: 'note',
    };
    expect(resolveToolSources(tool, { items: [{ id: 'note-1', title: '测试笔记', content: '正文' }] })).toEqual([
      {
        type: 'note',
        id: 'note-1',
        title: '测试笔记',
        excerpt: '正文',
        target: 'note-detail',
      },
    ]);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      resolveToolSources(
        {
          name: 'broken',
          toSources: () => {
            throw new Error('broken');
          },
        },
        {},
      ),
    ).toEqual([]);
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
