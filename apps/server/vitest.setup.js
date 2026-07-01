import { vi } from 'vitest';

// 中和 import 期就会连真实基础设施的模块,保证测试 hermetic、CI 无需 redis / 邮件服务。
// (db 连接池由各测试文件按需自行 mock,以便断言 query 调用。)

vi.mock('./util/redisClient.js', () => ({
  default: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setEx: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./util/nodemailer.js', () => ({
  default: { sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }) },
}));
