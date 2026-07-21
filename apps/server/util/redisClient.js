import { createClient } from 'redis';

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
    });

redisClient.on('error', () => {});

if (!isTestRuntime) {
  redisClient.connect().then(() => {
    console.log('Redis连接成功');
  });
}

export default redisClient;
