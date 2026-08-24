import { afterEach, describe, expect, it } from 'vitest';
import { clearVisionCircuitBreakerMemory, createVisionCircuitBreaker } from './circuitBreaker.js';

afterEach(() => clearVisionCircuitBreakerMemory());

describe('Vision 熔断器', () => {
  it('在失败阈值后立即打开，并在冷却期后允许探测恢复', async () => {
    let currentTime = 0;
    const breaker = createVisionCircuitBreaker({
      cache: null,
      now: () => currentTime,
      env: {
        AI_VISION_CIRCUIT_FAILURES: '2',
        AI_VISION_CIRCUIT_WINDOW_SECONDS: '30',
        AI_VISION_CIRCUIT_OPEN_SECONDS: '15',
      },
    });

    await breaker.recordFailure('deepseek:vision-a', 'AI_NETWORK_ERROR');
    await expect(breaker.isOpen('deepseek:vision-a')).resolves.toEqual({ open: false, reason: '' });
    await breaker.recordFailure('deepseek:vision-a', 'AI_NETWORK_ERROR');
    await expect(breaker.isOpen('deepseek:vision-a')).resolves.toEqual({
      open: true,
      reason: 'AI_NETWORK_ERROR',
    });

    currentTime = 15_001;
    await expect(breaker.isOpen('deepseek:vision-a')).resolves.toEqual({ open: false, reason: '' });
  });

  it('一次成功会清除当前进程的失败计数', async () => {
    const breaker = createVisionCircuitBreaker({
      cache: null,
      now: () => 1_000,
      env: { AI_VISION_CIRCUIT_FAILURES: '2' },
    });
    await breaker.recordFailure('deepseek:vision-b', 'AI_TIMEOUT');
    await breaker.recordSuccess('deepseek:vision-b');
    await breaker.recordFailure('deepseek:vision-b', 'AI_TIMEOUT');

    await expect(breaker.isOpen('deepseek:vision-b')).resolves.toEqual({ open: false, reason: '' });
  });
});
