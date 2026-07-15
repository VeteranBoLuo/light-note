import { describe, expect, it } from 'vitest';
import {
  containsCjk,
  getLocalKeywords,
  normalizeIconQuery,
  parseKeywordResponse,
  sanitizeIconifySvg,
  validateIconName,
} from './tagIconService.js';

describe('tagIconService', () => {
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
