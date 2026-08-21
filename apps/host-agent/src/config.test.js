import { describe, expect, it } from "vitest";
import { loadHostAgentConfig } from "./config.js";

describe("Host Agent 采样配置", () => {
  it("默认每 3 秒采样并保留完整 60 分钟窗口", () => {
    const config = loadHostAgentConfig({});

    expect(config.sampleIntervalMs).toBe(3_000);
    expect(config.maxHistorySamples).toBe(1_200);
  });

  it("允许显式 3 秒配置，过低值则回退安全默认值", () => {
    expect(
      loadHostAgentConfig({ HOST_AGENT_SAMPLE_INTERVAL_MS: "3000" })
        .sampleIntervalMs,
    ).toBe(3_000);
    expect(
      loadHostAgentConfig({ HOST_AGENT_SAMPLE_INTERVAL_MS: "500" })
        .sampleIntervalMs,
    ).toBe(3_000);
  });
});
