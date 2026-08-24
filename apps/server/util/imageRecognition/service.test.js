import { describe, expect, it, vi } from 'vitest';
import { createImageRecognitionProvider, IMAGE_RECOGNITION_POLICY_VERSION } from './service.js';

function circuit({ open = false } = {}) {
  return {
    isOpen: vi.fn().mockResolvedValue({ open, reason: open ? 'AI_NETWORK_ERROR' : '' }),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue({ open: false }),
  };
}

describe('统一图片识别服务', () => {
  it('AI Execution 内优先使用 DeepSeek Vision，不启动本地 OCR', async () => {
    const breaker = circuit();
    const visionProvider = {
      model: 'vision-test',
      recognizeImage: vi.fn().mockResolvedValue({
        content: '车牌号码 粤B12345',
        metadata: { engine: 'deepseek_vision', model: 'vision-test' },
      }),
    };
    const localProvider = { recognizeImage: vi.fn() };
    const provider = createImageRecognitionProvider({
      visionProvider,
      localProvider,
      circuitBreaker: breaker,
      hasExecution: () => true,
      env: {},
    });

    await expect(provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' })).resolves.toMatchObject({
      content: '车牌号码 粤B12345',
      metadata: { engine: 'deepseek_vision', policyVersion: IMAGE_RECOGNITION_POLICY_VERSION },
    });
    expect(localProvider.recognizeImage).not.toHaveBeenCalled();
    expect(breaker.recordSuccess).toHaveBeenCalledOnce();
  });

  it('网络故障自动切到本地 OCR，并返回可展示的降级元数据', async () => {
    const error = Object.assign(new Error('network failed'), { code: 'AI_NETWORK_ERROR' });
    const breaker = circuit();
    const provider = createImageRecognitionProvider({
      visionProvider: { model: 'vision-test', recognizeImage: vi.fn().mockRejectedValue(error) },
      localProvider: { recognizeImage: vi.fn().mockResolvedValue({ content: '本地识别文字' }) },
      circuitBreaker: breaker,
      hasExecution: () => true,
      env: {},
      now: () => Date.parse('2026-08-24T00:00:00.000Z'),
    });

    const result = await provider.recognizeImage(Buffer.from('image'), { extension: '.png' });
    expect(result).toMatchObject({
      content: '本地识别文字',
      metadata: {
        engine: 'local_ocr',
        fallbackReason: 'AI_NETWORK_ERROR',
        retryAfter: '2026-08-24T00:30:00.000Z',
      },
    });
    expect(result.metadata.warnings).toContain('VISION_FALLBACK_USED');
    expect(breaker.recordFailure).toHaveBeenCalledWith(expect.stringContaining('vision-test'), 'AI_NETWORK_ERROR');
  });

  it('熔断开启时跳过 DeepSeek，避免每个请求重复等待超时', async () => {
    const breaker = circuit({ open: true });
    const visionProvider = { model: 'vision-test', recognizeImage: vi.fn() };
    const localProvider = { recognizeImage: vi.fn().mockResolvedValue({ content: '熔断后的本地结果' }) };
    const provider = createImageRecognitionProvider({
      visionProvider,
      localProvider,
      circuitBreaker: breaker,
      hasExecution: () => true,
      env: {},
    });

    const result = await provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' });
    expect(result.metadata.fallbackReason).toContain('VISION_CIRCUIT_OPEN_AI_NETWORK_ERROR');
    expect(visionProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('后台无 AI Execution 时直接使用本地 OCR，不把上传或预解析偷偷变成模型调用', async () => {
    const visionProvider = { model: 'vision-test', recognizeImage: vi.fn() };
    const provider = createImageRecognitionProvider({
      visionProvider,
      localProvider: { recognizeImage: vi.fn().mockResolvedValue({ content: '后台本地文字' }) },
      circuitBreaker: circuit(),
      hasExecution: () => false,
      env: {},
    });

    const result = await provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' });
    expect(result.metadata).toMatchObject({
      engine: 'local_ocr',
      fallbackReason: 'AI_EXECUTION_REQUIRED',
      retryAfter: null,
    });
    expect(visionProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('识图模式配置拼写错误时保守回到本地 OCR，不意外外发图片', async () => {
    const visionProvider = { model: 'vision-test', recognizeImage: vi.fn() };
    const provider = createImageRecognitionProvider({
      visionProvider,
      localProvider: { recognizeImage: vi.fn().mockResolvedValue({ content: '保守本地结果' }) },
      circuitBreaker: circuit(),
      hasExecution: () => true,
      env: { AI_IMAGE_RECOGNITION_MODE: 'vision-primray' },
    });

    const result = await provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' });
    expect(result.metadata).toMatchObject({ engine: 'local_ocr', mode: 'local_only', fallbackReason: null });
    expect(visionProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('用户取消时不绕过取消信号继续本地 OCR', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const localProvider = { recognizeImage: vi.fn() };
    const provider = createImageRecognitionProvider({
      visionProvider: { model: 'vision-test', recognizeImage: vi.fn().mockRejectedValue(abort) },
      localProvider,
      circuitBreaker: circuit(),
      hasExecution: () => true,
      env: {},
    });

    await expect(provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' })).rejects.toBe(abort);
    expect(localProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('文件内容错误直接失败，不用本地 OCR 掩盖不安全输入', async () => {
    const inputError = Object.assign(new Error('invalid'), { code: 'FILE_CONTENT_INVALID' });
    const breaker = circuit();
    const localProvider = { recognizeImage: vi.fn() };
    const provider = createImageRecognitionProvider({
      visionProvider: { model: 'vision-test', recognizeImage: vi.fn().mockRejectedValue(inputError) },
      localProvider,
      circuitBreaker: breaker,
      hasExecution: () => true,
      env: {},
    });

    await expect(provider.recognizeImage(Buffer.from('image'), { extension: '.jpg' })).rejects.toBe(inputError);
    expect(localProvider.recognizeImage).not.toHaveBeenCalled();
    expect(breaker.recordFailure).not.toHaveBeenCalled();
  });
});
