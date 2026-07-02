import { describe, it, expect, vi } from 'vitest';

// mock db 连接池,避免测试时真实连接(本文件只测纯函数,不涉及查询)
vi.mock('../db/index.js', () => ({ default: { query: vi.fn(), getConnection: vi.fn() } }));

// common.js ↔ router/chat.js ↔ agentHandle.js 存在循环依赖(与 commonHandle.test.js 同款坑):
// 直接首个 import agentHandle.js 会拿到未初始化的导出而报错,先按应用真实顺序 import common.js 破环
await import('../util/common.js');
const { looksLikeLeakedToolCallSyntax } = await import('./agentHandle.js');

describe('looksLikeLeakedToolCallSyntax(工具调用协议泄漏检测)', () => {
  it('命中真实泄漏样例(用户线上遇到的原始文本)', () => {
    const leaked = '你是管理员，我来查询用户列表。\n\n<｜｜DSML｜｜tool_calls>\n<｜｜invoke name="query_users">\n</｜｜invoke>\n</｜｜DSML｜｜tool_calls>';
    expect(looksLikeLeakedToolCallSyntax(leaked)).toBe(true);
  });

  it('正常中文回答不误判', () => {
    expect(looksLikeLeakedToolCallSyntax('当前平台共有 46 个用户，其中 root 1 个、admin 44 个、visitor 1 个。')).toBe(false);
  });

  it('正常回答提到"调用"/"invoke"等词但没有特殊竖线,不误判', () => {
    expect(looksLikeLeakedToolCallSyntax('我需要调用 invoke 一下这个函数来查询数据')).toBe(false);
  });

  it('只有特殊竖线但不含工具调用关键词,不误判(避免误伤正常内容里偶尔出现的全角符号)', () => {
    expect(looksLikeLeakedToolCallSyntax('这是一段包含｜符号的普通文本')).toBe(false);
  });

  it('非字符串/空值安全返回 false', () => {
    expect(looksLikeLeakedToolCallSyntax(null)).toBe(false);
    expect(looksLikeLeakedToolCallSyntax(undefined)).toBe(false);
    expect(looksLikeLeakedToolCallSyntax('')).toBe(false);
  });
});
