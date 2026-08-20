import { describe, expect, it } from 'vitest';
import {
  HOST_AGENT_ACTIONS,
  HostAgentProtocolError,
  assertHostAgentProtocolVersion,
  hostAgentLogsPath,
  normalizeHostAgentLogLimit,
  validateHostAgentJobRequest,
} from './hostAgentProtocol.js';

describe('hostAgentProtocol', () => {
  it('只接受版本一致、动作和目标都在白名单内的任务', () => {
    expect(assertHostAgentProtocolVersion(1)).toBe(1);
    expect(
      validateHostAgentJobRequest({
        jobId: '0123456789abcdef',
        action: HOST_AGENT_ACTIONS.SERVICE_RESTART,
        targetId: 'lightnote-document-worker',
      }),
    ).toEqual({
      jobId: '0123456789abcdef',
      action: 'service.restart',
      targetId: 'lightnote-document-worker',
    });
  });

  it('拒绝未知字段、任意服务和不兼容版本', () => {
    expect(() => assertHostAgentProtocolVersion(2)).toThrow(HostAgentProtocolError);
    expect(() =>
      validateHostAgentJobRequest({
        jobId: '0123456789abcdef',
        action: 'service.restart',
        targetId: 'mysql',
      }),
    ).toThrowError(/not allowlisted/u);
    expect(() =>
      validateHostAgentJobRequest({
        jobId: '0123456789abcdef',
        action: 'nginx.reload',
        targetId: 'nginx',
        command: 'id',
      }),
    ).toThrowError(/unknown fields/u);
  });

  it('日志路径只接受服务白名单并限制行数', () => {
    expect(hostAgentLogsPath('nginx', 999)).toBe('/v1/logs/nginx?limit=300');
    expect(normalizeHostAgentLogLimit(1)).toBe(20);
    expect(() => hostAgentLogsPath('arbitrary-service')).toThrow(HostAgentProtocolError);
  });
});
