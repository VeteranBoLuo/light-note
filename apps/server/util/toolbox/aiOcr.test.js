import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../obsClient.js', () => ({ getObjectBufferFromObs: vi.fn() }));
vi.mock('../aiExecution/service.js', () => ({ runAiExecution: vi.fn() }));
import { executeAiOcr } from './aiOcr.js';

function setup({ pdf = false, basicText = false, error, uncertain = false } = {}) {
  const buffer = Buffer.from('original-image-bytes');
  const job = { id: 'job-1', user_id: 'owner', billing_medium: 'ai_quota' };
  const identity = { user: { id: 'owner', role: 'user' }, restrictions: [] };
  const descriptor = {
    id: 'file-1',
    kind: 'file',
    file_name: pdf ? 'scan.pdf' : 'scan.png',
    file_type: pdf ? 'application/pdf' : 'image/png',
    object_key: 'private-test-key',
  };
  const deps = {
    prepare: vi.fn(async () => [
      { descriptor, pages: pdf ? 2 : 1, hash: crypto.createHash('sha256').update(buffer).digest('hex') },
    ]),
    read: vi.fn(async () => buffer),
    execute: vi.fn(async (_, run) => run()),
    beforeRequest: vi.fn(),
    vision: {
      recognizeImage: vi.fn(async (data, options) => {
        await options.beforeRequest();
        if (error) throw error;
        return { content: '可核对的原文', metadata: { uncertainSegments: uncertain ? ['模糊片段'] : [] } };
      }),
    },
    render: vi.fn(async (data, options) => [
      { pageNumber: 2, content: await options.recognizePage(data, { extension: '.png' }) },
    ]),
    parse: vi.fn(async (data, descriptor, options) => {
      if (basicText) return { text: 'PDF 的原有文字', coverage: { complete: true } };
      if (pdf) {
        const pages = await options.ocrProvider.recognizePdf(data, { pageCount: 2, pageNumbers: [2] });
        return { text: pages[0].content, coverage: { complete: true } };
      }
      const result = await options.imageProvider.recognizeImage(data, { extension: '.png' });
      return { text: result.content, coverage: { complete: true } };
    }),
  };
  return {
    job,
    identity,
    deps,
    buffer,
    run: () => executeAiOcr(job, { resourceRefs: [{ type: 'file', id: 'file-1' }], sourceIds: [] }, identity, {}, deps),
  };
}
describe('AI OCR', () => {
  it('reads original bytes with one user execution and bounded vision calls', async () => {
    const { run, deps, buffer } = setup();
    const result = await run();
    expect(deps.execute).toHaveBeenCalledOnce();
    expect(deps.execute.mock.calls[0][0]).toMatchObject({
      billingPolicy: 'user',
      identity: { id: 'owner' },
      providerPlan: { image_recognition: { maxCalls: 1 } },
    });
    expect(deps.vision.recognizeImage.mock.calls[0][0]).toEqual(buffer);
    expect(deps.beforeRequest).toHaveBeenCalledOnce();
    expect(result.meta).toMatchObject({ recognitionMode: 'ai', modelCalled: true });
  });
  it('points mode uses only system AI billing', async () => {
    const state = setup();
    state.job.billing_medium = 'points';
    await state.run();
    expect(state.deps.execute.mock.calls[0][0]).toMatchObject({
      billingPolicy: 'system',
      systemId: 'toolbox_points',
      subjectIdentity: { id: 'owner' },
    });
  });
  it('routes scanned PDF pages to vision through the bounded renderer', async () => {
    const { run, deps } = setup({ pdf: true });
    await run();
    expect(deps.render.mock.calls[0][1]).toMatchObject({ pageCount: 2, pageNumbers: [2] });
    expect(deps.vision.recognizeImage).toHaveBeenCalledOnce();
  });
  it('extracts native PDF text without calling a model', async () => {
    const { run, deps } = setup({ pdf: true, basicText: true });
    expect((await run()).meta.modelCalled).toBe(false);
    expect(deps.vision.recognizeImage).not.toHaveBeenCalled();
    expect(deps.beforeRequest).not.toHaveBeenCalled();
  });
  it.each(['AI_QUOTA_EXCEEDED', 'AI_PROVIDER_ERROR'])(
    'propagates %s without falling back to free OCR',
    async (code) => {
      const { run, deps } = setup({ error: Object.assign(new Error('failed'), { code }) });
      await expect(run()).rejects.toMatchObject({ code });
      expect(deps.vision.recognizeImage).toHaveBeenCalledOnce();
    },
  );
  it('stops provider calls after a PDF page failure even when the parser collects errors', async () => {
    const { run, deps } = setup({ pdf: true, error: Object.assign(new Error('quota'), { code: 'AI_QUOTA_EXCEEDED' }) });
    deps.parse.mockImplementation(async (data, descriptor, options) => {
      for (let page = 0; page < 2; page++) {
        try {
          await options.imageProvider.recognizeImage(data, { extension: '.png' });
        } catch {}
      }
      return { text: '', coverage: { complete: false } };
    });
    await expect(run()).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED' });
    expect(deps.vision.recognizeImage).toHaveBeenCalledOnce();
  });
  it('marks uncertain transcription as partial and asks for verification', async () => {
    const result = await setup({ uncertain: true }).run();
    expect(result.outcome).toBe('partial_succeeded');
    expect(result.content).toContain('对照原文件核对');
  });
  it('rejects changed bytes before vision', async () => {
    const { run, deps } = setup();
    deps.read.mockResolvedValue(Buffer.from('changed'));
    await expect(run()).rejects.toMatchObject({ code: 'TOOLBOX_RESOURCE_STALE' });
    expect(deps.vision.recognizeImage).not.toHaveBeenCalled();
  });
});
