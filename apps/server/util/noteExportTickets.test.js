import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisValues = new Map();
const redisClient = {
  setEx: vi.fn(async (key, _ttl, value) => {
    redisValues.set(key, value);
    return 'OK';
  }),
  get: vi.fn(async (key) => redisValues.get(key) ?? null),
  getDel: vi.fn(async (key) => {
    const value = redisValues.get(key) ?? null;
    redisValues.delete(key);
    return value;
  }),
  del: vi.fn(async (key) => (redisValues.delete(key) ? 1 : 0)),
};

vi.mock('./redisClient.js', () => ({ default: redisClient }));

const { MAX_EXPORT_BYTES, consumeExportTicket, createExportTicket, isValidExportToken } = await import(
  './noteExportTickets.js'
);

const baseTicket = () => ({
  userId: 'user-1',
  noteId: 'note-1',
  format: 'md',
  fileName: '周报.md',
  content: Buffer.from('# 周报\n\n本周完成导出中转', 'utf-8'),
});

beforeEach(() => {
  vi.clearAllMocks();
  redisValues.clear();
});

describe('createExportTicket', () => {
  it('票据 token 是合法 base64url，且内容不以明文 token 为键存储', async () => {
    const { token, expiresIn } = await createExportTicket(baseTicket());

    expect(isValidExportToken(token)).toBe(true);
    expect(expiresIn).toBeGreaterThan(0);
    // Redis 里存的是哈希键，明文 token 不应出现在任何键里
    for (const key of redisValues.keys()) {
      expect(key).not.toContain(token);
    }
  });

  it('同一用户再次导出会挤掉上一张票据', async () => {
    const first = await createExportTicket(baseTicket());
    const second = await createExportTicket({ ...baseTicket(), fileName: '月报.md' });

    expect(await consumeExportTicket(first.token, 'user-1')).toBeNull();
    const consumed = await consumeExportTicket(second.token, 'user-1');
    expect(consumed?.fileName).toBe('月报.md');
  });
});

describe('consumeExportTicket', () => {
  it('取回原始内容并保持字节一致', async () => {
    const ticket = baseTicket();
    const { token } = await createExportTicket(ticket);

    const consumed = await consumeExportTicket(token, 'user-1');
    expect(consumed?.format).toBe('md');
    expect(consumed?.fileName).toBe('周报.md');
    expect(consumed?.content.equals(ticket.content)).toBe(true);
  });

  it('PDF 这类二进制内容往返不被破坏', async () => {
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0a, 0x80]);
    const { token } = await createExportTicket({ ...baseTicket(), format: 'pdf', content });

    const consumed = await consumeExportTicket(token, 'user-1');
    expect(consumed?.content.equals(content)).toBe(true);
  });

  it('同一票据不能被消费两次', async () => {
    const { token } = await createExportTicket(baseTicket());

    expect(await consumeExportTicket(token, 'user-1')).not.toBeNull();
    expect(await consumeExportTicket(token, 'user-1')).toBeNull();
  });

  it('换人来取一律按不存在处理，且票据已被消费掉不能再被本人取回', async () => {
    const { token } = await createExportTicket(baseTicket());

    expect(await consumeExportTicket(token, 'user-2')).toBeNull();
    // getDel 是原子取删：越权访问同样消费掉票据，避免留下可被继续尝试的凭证
    expect(await consumeExportTicket(token, 'user-1')).toBeNull();
  });

  it('token 形态非法时不查 Redis', async () => {
    expect(await consumeExportTicket('../../etc/passwd', 'user-1')).toBeNull();
    expect(await consumeExportTicket('', 'user-1')).toBeNull();
    expect(await consumeExportTicket(undefined, 'user-1')).toBeNull();
    expect(redisClient.getDel).not.toHaveBeenCalled();
  });

  it('单件上限落在 bodyParser 的 10MB 限制之内', () => {
    // base64 膨胀 4/3，上限本身再加 JSON 包装必须仍小于 app.js 的 10MB body 限制
    expect(Math.ceil((MAX_EXPORT_BYTES * 4) / 3)).toBeLessThan(10 * 1024 * 1024);
  });
});
