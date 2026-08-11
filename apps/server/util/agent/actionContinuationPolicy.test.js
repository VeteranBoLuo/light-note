import { describe, expect, it } from 'vitest';
import { resolveActionContinuationPolicy } from './actionContinuationPolicy.js';

const writeIntent = { kind: 'write', capabilityId: 'todo.create' };
const readIntent = { kind: 'read', capabilityId: 'todo.query' };

describe('agent actionContinuationPolicy', () => {
  it('纯写操作在权威回执后终止，不再生成重复回复', () => {
    const plan = { requestClass: 'data_action', intents: [writeIntent], needsClarification: false };

    expect(resolveActionContinuationPolicy(plan)).toBe('terminal');
  });

  it('只为定位写入目标的读依赖仍属于纯操作', () => {
    const plan = {
      requestClass: 'data_action',
      intents: [readIntent, { ...writeIntent, dependsOn: [0] }],
      needsClarification: false,
    };

    expect(resolveActionContinuationPolicy(plan)).toBe('terminal');
  });

  it('混合请求在写入之外仍有回答目标时允许 Final Reply', () => {
    const plan = { requestClass: 'mixed', intents: [readIntent, writeIntent], needsClarification: false };

    expect(resolveActionContinuationPolicy(plan)).toBe('final_reply');
  });

  it.each([
    ['没有语义计划', null],
    ['混合请求没有写意图', { requestClass: 'mixed', intents: [readIntent] }],
    ['仍需澄清', { requestClass: 'mixed', intents: [writeIntent], needsClarification: true }],
    ['未知请求分类', { requestClass: 'unknown', intents: [writeIntent] }],
  ])('%s 时失败关闭为 terminal', (_label, plan) => {
    expect(resolveActionContinuationPolicy(plan)).toBe('terminal');
  });
});
