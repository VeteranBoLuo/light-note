import { describe, expect, it, vi } from 'vitest';
import skill, { splitSummaryText } from './documentSummarySkill.js';
import { createAiSkillExecutionConfig } from '../../aiBillingCatalog.js';
import { AI_DOCUMENT_SUMMARY_MAX_CHARS } from '@lightnote/shared/ai-skill-protocol';
import { resolveRequestFieldPolicy } from '../../security/requestFieldPolicy.js';

describe('local document summary', () => {
  it('rejects empty, oversized and forged input before model work', () => {
    for (const text of ['', '   ', null, 'x'.repeat(AI_DOCUMENT_SUMMARY_MAX_CHARS + 1)]) {
      expect(() => skill.validateInput({ title: 'a.pdf', text })).toThrow();
    }
    expect(() => skill.validateInput({ title: 'a.pdf', text: 'ok', billingPolicy: 'system' })).toThrow();
  });
  it('preserves every character including astral unicode across chunks', () => {
    const text = 'a'.repeat(19999) + '🌏' + 'b'.repeat(25000);
    expect(splitSummaryText(text).join('')).toBe(text);
    expect(splitSummaryText(text).every((chunk) => chunk.length <= 20000)).toBe(true);
  });
  it('runs every batch then reduces under one user execution plan', async () => {
    const text = 'A'.repeat(20000) + 'B'.repeat(20000) + 'TAIL';
    const input = skill.validateInput({ title: 'a.pdf', text });
    const request = { input, client: { locale: 'en-US' }, scope: { resourceRefs: [] } };
    const plan = createAiSkillExecutionConfig(skill, request);
    expect(plan.maxUserProviderCalls).toBe(4);
    expect(plan.maxPlatformProviderCalls).toBe(1);
    expect(plan.billingPolicy).toBe('user');
    expect(() => createAiSkillExecutionConfig(skill, request, { billingPolicy: 'system' })).toThrow();
    const invoke = vi.fn().mockResolvedValue({ kind: 'grounded_markdown', content: 'Summary' });
    const prepared = await skill.prepare({ input, request, dependencies: { callGroundedSkillModel: invoke } });
    expect(invoke).not.toHaveBeenCalled();
    const result = await prepared.callModel({ modelPolicy: skill.modelPolicy, trace: {} });
    expect(result.content).toBe('Summary');
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(invoke.mock.calls[2][0].messages[1].content).toContain('TAIL');
    expect(prepared.coverage).toMatchObject({ analyzedCharacters: text.length, truncatedCharacters: 0 });
  });
  it('stops after batch failure or cancellation without returning a partial summary', async () => {
    const input = { title: 'a.pdf', text: 'a'.repeat(40001) };
    const invoke = vi.fn().mockRejectedValue(new Error('provider failed'));
    const prepared = await skill.prepare({ input, dependencies: { callGroundedSkillModel: invoke } });
    await expect(prepared.callModel({ modelPolicy: skill.modelPolicy })).rejects.toThrow('provider failed');
    expect(invoke).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(prepared.callModel({ signal: controller.signal })).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('permits document prose only at its exact request field and within the shared limit', () => {
    const context = {
      method: 'POST',
      path: '/api/ai/skills/execute',
      body: { skillId: skill.id, input: { text: 'sudo rm -rf /' } },
    };
    expect(resolveRequestFieldPolicy(context, 'body.input.text')).toMatchObject({ trustedEnvelope: true });
    expect(resolveRequestFieldPolicy({ ...context, path: '/other' }, 'body.input.text')).toBeNull();
    expect(
      resolveRequestFieldPolicy(
        { ...context, body: { ...context.body, input: { text: 'x'.repeat(AI_DOCUMENT_SUMMARY_MAX_CHARS + 1) } } },
        'body.input.text',
      ),
    ).toMatchObject({ trustedEnvelope: false, overBudget: true });
  });
});
