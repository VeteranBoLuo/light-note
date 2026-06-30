import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
});

redisClient.on('error', () => {});

redisClient.connect().then(() => {
  console.log('Redis连接成功');
});

export default redisClient;