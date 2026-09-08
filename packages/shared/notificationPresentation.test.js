import { describe, expect, it } from "vitest";
import {
  notificationPresentation,
  browserNotificationPresentation,
} from "./notificationPresentation.js";
describe("shared notification presentation", () => {
  it("shares localized growth titles and hides growth body", () => {
    const item = {
      type: "level_up",
      title: "raw",
      content: "ignored",
      meta: '{"level":2}',
    };
    expect(notificationPresentation(item, "zh-CN")).toEqual({
      title: "升级到 Lv.2 · 书生",
      content: "",
    });
    expect(browserNotificationPresentation(item, "en-US")).toEqual({
      title: "Leveled up to Lv.2 · Scholar",
      body: "",
    });
  });
  it("preserves ordinary inbox titles and limits plaintext push previews", () => {
    expect(
      browserNotificationPresentation(
        { title: "通知", content: "<b>提醒</b>\n" + "长".repeat(400) },
        "zh-CN",
      ).body,
    ).toHaveLength(240);
    expect(
      browserNotificationPresentation(
        { type: "opinion_reply", title: "raw", content: "reply" },
        "en-US",
      ),
    ).toEqual({ title: "Your feedback got a reply", body: "reply" });
  });
});
