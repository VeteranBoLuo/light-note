import { describe, it, expect, vi } from 'vitest';

// mock db 连接池:extractTokens 是纯函数不查库,但模块顶层 import 了 db/index.js,
// mock 掉避免测试时真实尝试连生产库
const dbMocks = vi.hoisted(() => ({ query: vi.fn(), getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: dbMocks }));

const { extractTokens, retrieve } = await import('./knowledgeService.js');

describe('extractTokens(知识库检索分词)', () => {
  it('真实线上样例:"怎么联系官方呢？"不再产出"怎"/"么"等噪声单字', () => {
    const tokens = extractTokens('怎么联系官方呢？');
    expect(tokens).not.toContain('怎');
    expect(tokens).not.toContain('么');
    expect(tokens).toContain('联系');
    expect(tokens).toContain('官方');
  });

  it('存在多字 token 时完全不产出单字(避免高频字挤占权重)', () => {
    const tokens = extractTokens('忘记密码怎么办');
    expect(tokens.every((t) => t.length >= 2)).toBe(true);
    expect(tokens).toContain('忘记');
    expect(tokens).toContain('密码');
  });

  it('纯单字查询兜底返回单字,不会因为提不出多字 token 而检索不到任何内容', () => {
    expect(extractTokens('笔')).toEqual(['笔']);
  });

  it('停用字仍被正确过滤掉(单字兜底场景下)', () => {
    expect(extractTokens('的')).toEqual([]);
  });

  it('英文单词与二字中文词共存时正常提取', () => {
    const tokens = extractTokens('GitHub 仓库地址');
    expect(tokens).toContain('github');
    expect(tokens).toContain('仓库');
  });

  it('空字符串/纯符号返回空数组', () => {
    expect(extractTokens('')).toEqual([]);
    expect(extractTokens('？！。')).toEqual([]);
  });
});

describe('retrieve(知识库来源标识)', () => {
  it('保留知识条目的 id、分类与可见状态，供来源卡片生成深链', async () => {
    dbMocks.query.mockResolvedValueOnce([
      [
        {
          id: 'knowledge-id',
          title: '游客模式有什么限制',
          category: '帮助中心',
          status: 'public',
          content: '<p>游客可以浏览公开内容。</p>',
        },
      ],
    ]);

    const result = await retrieve('user-id', '游客模式', 3, true);

    expect(dbMocks.query).toHaveBeenCalledWith(expect.stringContaining('SELECT id, title, category, status'));
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'knowledge-id',
        title: '游客模式有什么限制',
        category: '帮助中心',
        status: 'public',
      }),
    );
  });
});
