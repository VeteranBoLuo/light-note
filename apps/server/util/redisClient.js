import { createClient } from 'redis';
import { stableAgentErrorCode } from './agent/logSafety.js';

const isTestRuntime = process.env.NODE_ENV === 'test';

function testRedisDisabled() {
  const error = new Error('TEST_REDIS_DISABLED: 测试必须显式 mock Redis，禁止连接真实 Redis');
  error.code = 'TEST_REDIS_DISABLED';
  return Promise.reject(error);
}

const redisClient = isTestRuntime
  ? {
      isOpen: false,
      on: () => redisClient,
      connect: testRedisDisabled,
      get: testRedisDisabled,
      getDel: testRedisDisabled,
      set: testRedisDisabled,
      setEx: testRedisDisabled,
      del: testRedisDisabled,
      expire: testRedisDisabled,
      eval: testRedisDisabled,
      quit: async () => {},
    }
  : createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      // 断线重连期间命令立即失败，由调用方降级或返回错误；默认离线队列会让请求一直挂到 Redis 恢复。
      disableOfflineQueue: true,
      // 连接仍在但 Redis 卡住时同样有界失败；本机 Redis 的正常命令均远低于该值。订阅命令不受此限制。
      commandOptions: { timeout: 3000 },
    });

// Redis 故障不再静默(断连/超时期间验证码等纯 Redis 数据不可用,必须可观测);按 60s 抑制避免断连风暴刷屏
let lastRedisErrorLogAt = 0;
redisClient.on('error', (err) => {
  const now = Date.now();
  if (now - lastRedisErrorLogAt > 60_000) {
    lastRedisErrorLogAt = now;
    console.error('[redis] 连接/运行错误 code=%s', stableAgentErrorCode(err));
  }
});

if (!isTestRuntime) {
  redisClient
    .connect()
    .then(() => {
      console.log('Redis连接成功');
    })
    .catch((err) => {
      console.error('[redis] 初始连接失败 code=%s', stableAgentErrorCode(err));
    });
}

export default redisClient;
