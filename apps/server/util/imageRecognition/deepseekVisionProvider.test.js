import { describe, expect, it, vi } from 'vitest';
import { recognizeImageWithDeepSeekVision } from './deepseekVisionProvider.js';

const prepared = {
  images: [
    { buffer: Buffer.from('full'), mimeType: 'image/jpeg' },
    { buffer: Buffer.from('detail'), mimeType: 'image/jpeg' },
  ],
  preprocessVersion: 1,
  warnings: [],
};

describe('DeepSeek Vision 适配器', () => {
  it('使用混合图片块、独立视觉模型和 JSON 输出契约', async () => {
    const request = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        hasReadableText: true,
        text: '中华人民共和国机动车行驶证\n号牌号码 粤B12345',
        documentType: '机动车行驶证',
        uncertainSegments: ['地址末字'],
      }),
      provider: 'deepseek',
      model: 'vision-test',
    });

    const result = await recognizeImageWithDeepSeekVision(Buffer.from('source'), {
      extension: '.jpg',
      request,
      prepare: vi.fn().mockResolvedValue(prepared),
      model: 'vision-test',
    });

    const [messages, options] = request.mock.calls[0];
    expect(messages[0].content.filter((block) => block.type === 'image_url')).toHaveLength(2);
    expect(messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/u);
    expect(options).toMatchObject({
      providerOverride: 'deepseek',
      modelOverride: 'vision-test',
      responseFormat: { type: 'json_object' },
      missingUsageOnFailure: 'waive',
      trace: { stage: 'image_recognition' },
    });
    expect(result).toMatchObject({
      content: expect.stringContaining('粤B12345'),
      metadata: {
        engine: 'deepseek_vision',
        model: 'vision-test',
        quality: { status: 'uncertain' },
      },
    });
  });

  it('拒绝把非 JSON 或空结果当成识别成功', async () => {
    const prepare = vi.fn().mockResolvedValue({ ...prepared, images: prepared.images.slice(0, 1) });
    await expect(
      recognizeImageWithDeepSeekVision(Buffer.from('source'), {
        extension: '.jpg',
        request: vi.fn().mockResolvedValue({ content: '随便一段文字' }),
        prepare,
      }),
    ).rejects.toMatchObject({ code: 'VISION_OUTPUT_INVALID' });

    await expect(
      recognizeImageWithDeepSeekVision(Buffer.from('source'), {
        extension: '.jpg',
        request: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            hasReadableText: false,
            text: '',
            documentType: 'unknown',
            uncertainSegments: [],
          }),
        }),
        prepare,
      }),
    ).rejects.toMatchObject({ code: 'VISION_NO_TEXT' });
  });

  it('拒绝截断输出和字段类型漂移', async () => {
    const prepare = vi.fn().mockResolvedValue({ ...prepared, images: prepared.images.slice(0, 1) });
    await expect(
      recognizeImageWithDeepSeekVision(Buffer.from('source'), {
        extension: '.jpg',
        request: vi.fn().mockResolvedValue({ content: '{}', finishReason: 'length' }),
        prepare,
      }),
    ).rejects.toMatchObject({ code: 'VISION_OUTPUT_INVALID' });

    await expect(
      recognizeImageWithDeepSeekVision(Buffer.from('source'), {
        extension: '.jpg',
        request: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            hasReadableText: true,
            text: { value: '不能把对象强转成正文' },
            documentType: 'unknown',
            uncertainSegments: [],
          }),
        }),
        prepare,
      }),
    ).rejects.toMatchObject({ code: 'VISION_OUTPUT_INVALID' });
  });
});
