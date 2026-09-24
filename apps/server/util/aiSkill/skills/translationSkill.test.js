import { describe, it, expect, vi } from 'vitest';
import skill from './translationSkill.js';
import { splitTranslationText } from '../../toolbox/translationText.js';
import { createAiSkillExecutionConfig } from '../../aiBillingCatalog.js';
describe('translation execution', () => {
  const input = {text:('Hello world.\n\n').repeat(600),sourceLanguage:'auto',targetLanguage:'zh-CN'};
  it('budgets every segment in one root and only allows user AI quota', async () => {
    const count = splitTranslationText(input.text).length;
    const config = createAiSkillExecutionConfig(skill,{input,scope:{resourceRefs:[]}});
    expect(config.maxUserProviderCalls).toBe(count);
    expect(config.maxPlatformProviderCalls).toBe(1);
    expect(config.reservationTokens).toBeGreaterThan(count * skill.modelPolicy.maxTokens);
    expect(() => createAiSkillExecutionConfig(skill,{input},{billingPolicy:'system'})).toThrow();
    const onTranslated = vi.fn();
    const invoke = vi.fn(async ({messages,validateArguments}) => { const source = JSON.parse(messages[1].content); return validateArguments({id:source.id,text:source.text,complete:true}); });
    const prepared = await skill.prepare({input,dependencies:{callStructuredSkillModel:invoke,onTranslated}});
    const result = await prepared.callModel({modelPolicy:skill.modelPolicy,trace:{}});
    expect(result.content).toBe(input.text);
    expect(invoke).toHaveBeenCalledTimes(count);
    expect(onTranslated.mock.calls[0][0]).toHaveLength(count);
  });
  it('never publishes partial output on failure, truncation or cancellation', async () => {
    const onTranslated = vi.fn();
    const invoke = vi.fn(async ({validateArguments}) => validateArguments({id:'1',text:'Incomplete',complete:false}));
    const prepared = await skill.prepare({input,dependencies:{callStructuredSkillModel:invoke,onTranslated}});
    await expect(prepared.callModel({modelPolicy:skill.modelPolicy})).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(onTranslated).not.toHaveBeenCalled();
    const controller = new AbortController();controller.abort();
    await expect(prepared.callModel({signal:controller.signal})).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

it('streams uncommitted text before validation and resets just the repairing segment', async () => {
  const onProgress = vi.fn(), onTranslated = vi.fn(), beforeSegment = vi.fn();
  const prepared = await skill.prepare({ input: { text: 'Hello', sourceLanguage: 'auto', targetLanguage: 'zh-CN' }, dependencies: {
    onProgress, onTranslated, beforeSegment,
    callStructuredSkillModel: async options => {
      expect(options.stream).toBe(true);
      await options.beforeRequest();
      options.onToolCallDelta({ index: 0, name: 'submit_translation', arguments: '{"id":"1","text":"你' });
      expect(onProgress.mock.calls.at(-1)[0].content).toBe('你');
      expect(onTranslated).not.toHaveBeenCalled();
      options.onReset(); expect(onProgress.mock.calls.at(-1)[0].content).toBe('');
      return options.validateArguments({ id: '1', text: '你好', complete: true });
    },
  }});
  expect(await prepared.callModel({ modelPolicy: skill.modelPolicy })).toMatchObject({ content: '你好' });
  expect(onTranslated).toHaveBeenCalledOnce(); expect(beforeSegment).toHaveBeenCalledOnce();
});
