import { describe, expect, it } from "vitest";
import {
  AI_SKILL_PROTOCOL_VERSION,
  AiSkillProtocolError,
  validateAiSkillRequest,
  validateAiSkillResponse,
} from "./aiSkillProtocol.js";

const requestFixture = () => ({
  protocolVersion: AI_SKILL_PROTOCOL_VERSION,
  requestId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
  skillId: "file.summarize",
  skillVersion: 1,
  threadId: null,
  input: { instruction: "总结主要结论" },
  scope: { resourceRefs: [{ type: "file", id: "f-1", version: "3" }] },
  client: {
    locale: "zh-CN",
    timezone: "Asia/Singapore",
    surface: "cloud_file_detail",
  },
});

describe("aiSkillProtocol", () => {
  it("规范化封闭世界的 Skill 请求", () => {
    expect(validateAiSkillRequest(requestFixture())).toEqual(requestFixture());
  });

  it("拒绝未知字段、重复资源和不兼容版本", () => {
    expect(() =>
      validateAiSkillRequest({ ...requestFixture(), prompt: "旁路字段" }),
    ).toThrow(AiSkillProtocolError);
    expect(() =>
      validateAiSkillRequest({
        ...requestFixture(),
        scope: {
          resourceRefs: [
            { type: "file", id: "f-1" },
            { type: "file", id: "f-1" },
          ],
        },
      }),
    ).toThrowError(/重复/u);
    expect(() =>
      validateAiSkillRequest({ ...requestFixture(), protocolVersion: 2 }),
    ).toThrowError(/版本不兼容/u);
  });

  it("要求成功响应有结果、失败响应有错误", () => {
    const base = {
      protocolVersion: 1,
      requestId: requestFixture().requestId,
      skillId: "file.summarize",
      skillVersion: 1,
      status: "completed",
      threadId: null,
      scopeDigest: "a".repeat(64),
      result: { kind: "grounded_markdown", content: "结论" },
      sources: [],
      coverage: { complete: true, warnings: [] },
      availableActions: [],
      receipt: { modelCalled: true },
      error: null,
    };
    expect(validateAiSkillResponse(base).status).toBe("completed");
    expect(() =>
      validateAiSkillResponse({ ...base, result: null }),
    ).toThrowError(/必须包含 result/u);
    expect(() =>
      validateAiSkillResponse({
        ...base,
        status: "failed",
        result: null,
        error: null,
      }),
    ).toThrowError(/必须包含 error/u);
  });
});
