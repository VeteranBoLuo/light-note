import { describe, expect, it } from 'vitest';
import { createToolboxArtifactSaveRequestId, createToolboxClientRequestId, inferToolboxDocumentMime } from './toolbox';

describe('工具箱客户端协议辅助', () => {
  it('为无 MIME 的系统文件选择结果按扩展名补全受控类型', () => {
    expect(inferToolboxDocumentMime({ name: 'scan.PDF', type: '' })).toBe('application/pdf');
    expect(inferToolboxDocumentMime({ name: 'photo.jpeg', type: '' })).toBe('image/jpeg');
    expect(inferToolboxDocumentMime({ name: 'photo.webp', type: '' })).toBe('image/webp');
    expect(inferToolboxDocumentMime({ name: 'unknown.bin', type: '' })).toBe('application/octet-stream');
  });

  it('生成满足服务端幂等键字符与长度约束的请求标识', () => {
    const requestId = createToolboxClientRequestId('quote');
    expect(requestId).toMatch(/^quote:[A-Za-z0-9:_-]+$/u);
    expect(requestId.length).toBeGreaterThanOrEqual(12);
    expect(requestId.length).toBeLessThanOrEqual(64);
  });

  it('同一版本成果跨重试复用稳定的保存请求标识', () => {
    const first = createToolboxArtifactSaveRequestId('58a8f855-ebbc-5ea2-b766-7b02f1df8e7a', 2);
    const second = createToolboxArtifactSaveRequestId('58a8f855-ebbc-5ea2-b766-7b02f1df8e7a', 2);
    expect(first).toBe(second);
    expect(first).toMatch(/^save:[A-Za-z0-9_-]+:v2$/u);
    expect(first.length).toBeLessThanOrEqual(64);
  });
});
