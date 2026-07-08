import { describe, it, expect, vi } from 'vitest';

// growth.js 顶层 import pool from '../db/index.js';纯逻辑测试不碰库,mock 掉以免 import 期连真库
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn(), getConnection: vi.fn() },
}));

import { levelForExp, rankOf, RANKS, MAX_LEVEL } from './growth.js';

describe('growth 段位表', () => {
  it('15 级、cumExp 从 0 严格递增到 50000', () => {
    expect(RANKS).toHaveLength(15);
    expect(MAX_LEVEL).toBe(15);
    expect(RANKS[0].cumExp).toBe(0);
    expect(RANKS[14].cumExp).toBe(50000);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].cumExp).toBeGreaterThan(RANKS[i - 1].cumExp);
    }
  });

  it('权益(容量/AI token)随等级单调不降,端点符合方案', () => {
    expect(RANKS[0].spaceMb).toBe(500);
    expect(RANKS[14].spaceMb).toBe(5120);
    expect(RANKS[0].aiTokenDaily).toBe(100_000);
    expect(RANKS[14].aiTokenDaily).toBe(800_000);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].spaceMb).toBeGreaterThanOrEqual(RANKS[i - 1].spaceMb);
      expect(RANKS[i].aiTokenDaily).toBeGreaterThanOrEqual(RANKS[i - 1].aiTokenDaily);
    }
  });
});

describe('levelForExp 边界', () => {
  it('阈值处即升级(含=阈值)', () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(499)).toBe(1);
    expect(levelForExp(500)).toBe(2); // 正好达阈值算升级
    expect(levelForExp(999)).toBe(2);
    expect(levelForExp(1000)).toBe(3);
    expect(levelForExp(1699)).toBe(3);
    expect(levelForExp(1700)).toBe(4);
  });
  it('满级与超满级钳制到 15', () => {
    expect(levelForExp(49999)).toBe(14);
    expect(levelForExp(50000)).toBe(15);
    expect(levelForExp(9_999_999)).toBe(15);
  });
});

describe('rankOf 越界钳制', () => {
  it('1..15 正常,越界钳到端点', () => {
    expect(rankOf(1).name).toBe('蒙童');
    expect(rankOf(3).name).toBe('秀才');
    expect(rankOf(15).name).toBe('文圣');
    expect(rankOf(0).name).toBe('蒙童');
    expect(rankOf(99).name).toBe('文圣');
  });
});
