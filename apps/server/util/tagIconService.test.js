import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestAi: vi.fn() }));

vi.mock('./agent/aiGateway.js', () => ({ requestAi: mocks.requestAi }));

import {
  containsCjk,
  getLocalKeywords,
  normalizeIconQuery,
  parseKeywordResponse,
  searchTagIcons,
  sanitizeIconifySvg,
  validateIconName,
} from './tagIconService.js';

describe('tagIconService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('规范化并限制搜索内容', () => {
    expect(normalizeIconQuery('  Redis   命令参考  ')).toBe('Redis 命令参考');
    expect(normalizeIconQuery('a'.repeat(100))).toHaveLength(80);
    expect(containsCjk('Redis 命令')).toBe(true);
    expect(containsCjk('redis database')).toBe(false);
  });

  it('从 AI JSON 中提取安全英文关键词', () => {
    expect(parseKeywordResponse('```json\n{"keywords":["Redis","database","终端","terminal"]}\n```')).toEqual([
      'redis',
      'database',
      'terminal',
    ]);
    expect(parseKeywordResponse('not json')).toEqual([]);
  });

  it('AI 不可用时可使用常见中文关键词降级', () => {
    expect(getLocalKeywords('数据库学习笔记')).toEqual(['database', 'server', 'study', 'book']);
  });

  it('中文关键词转换经过 Gateway，且模型不能获得工具调用能力', async () => {
    mocks.requestAi.mockResolvedValue({ content: '{"keywords":["database"]}' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ icons: ['lucide:database'] }),
      }),
    );

    const result = await searchTagIcons({
      query: '专用中文词条',
      useAi: true,
      trace: { traceId: 'trace-icon-1' },
    });

    expect(mocks.requestAi).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        toolChoice: 'none',
        maxTokens: 120,
        trace: expect.objectContaining({
          traceId: 'trace-icon-1',
          taskType: 'tag_icon_search',
          stage: 'tag_icon_keywords',
        }),
      }),
    );
    expect(result.icons).toContain('lucide:database');
  });

  it('显式 AI 扩展失败时不伪装成本地降级成功，且日志不泄漏 Provider 细节', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.requestAi.mockRejectedValueOnce(new Error('Authorization: Bearer hidden-provider-token'));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(searchTagIcons({ query: '数据库专用降级词', useAi: true })).rejects.toThrow();

    expect(fetch).not.toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(' ')).not.toContain('hidden-provider-token');
    warning.mockRestore();
  });

  it('显式 AI 扩展返回无效结构时失败，不把本地词误报为 AI 结果', async () => {
    mocks.requestAi.mockResolvedValueOnce({ content: 'not json' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(searchTagIcons({ query: '数据库结构异常', useAi: true })).rejects.toMatchObject({
      code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('只接受白名单 Iconify 图标名称', () => {
    expect(validateIconName('lucide:database')).toEqual({
      icon: 'lucide:database',
      prefix: 'lucide',
      name: 'database',
    });
    expect(() => validateIconName('unknown:database')).toThrow('ICON_NAME_INVALID');
    expect(() => validateIconName('https://example.com/icon.svg')).toThrow('ICON_NAME_INVALID');
  });

  it('清理尺寸并拒绝危险 SVG', () => {
    const safe = sanitizeIconifySvg(
      '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>',
    );
    expect(safe).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(safe).not.toContain('width="24"');
    expect(safe).not.toContain('height="24"');
    expect(() => sanitizeIconifySvg('<svg><script>alert(1)</script></svg>')).toThrow('ICON_SVG_UNSAFE');
    expect(() => sanitizeIconifySvg('<svg><path onclick="alert(1)" d="M0 0"/></svg>')).toThrow('ICON_SVG_UNSAFE');
  });
});
