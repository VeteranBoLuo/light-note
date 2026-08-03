import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchWebMeta: vi.fn() }));

vi.mock('../../fetchWebMeta.js', () => ({ fetchWebMeta: mocks.fetchWebMeta }));

const { default: readUrl } = await import('./read_url.js');

describe('read_url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('允许读取用户本轮明确提供的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://uuye.163.com' },
        {
          question: 'https://uuye.163.com这个链接是干嘛的？',
          agentContentScope: { externalWeb: false },
        },
      ),
    ).resolves.toEqual({ url: 'https://uuye.163.com' });
  });

  it('关闭广泛联网时拒绝模型替换为用户未提供的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://other.example.com' },
        {
          question: '总结 https://example.com',
          agentContentScope: { externalWeb: false },
        },
      ),
    ).rejects.toThrow('URL_SCOPE_FORBIDDEN');
  });

  it('允许读取服务端从所引用书签中恢复的 URL', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://example.com/docs' },
        {
          question: '继续分析刚才那个书签',
          agentContentScope: {
            externalWeb: false,
            allowedWebUrls: ['https://example.com/docs'],
          },
        },
      ),
    ).resolves.toEqual({ url: 'https://example.com/docs' });
  });

  it('保留广泛联网开关对其他有效 URL 的授权', async () => {
    await expect(
      readUrl.prepareArgs(
        { url: 'https://other.example.com' },
        { question: '', agentContentScope: { externalWeb: true } },
      ),
    ).resolves.toEqual({ url: 'https://other.example.com' });
  });
});
