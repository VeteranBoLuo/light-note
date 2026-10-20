import { describe, expect, it } from "vitest";
import {
  notificationPresentation,
  browserNotificationPresentation,
} from "./notificationPresentation.js";
describe("shared notification presentation", () => {
  it("localizes new submission notices without exposing answer content", () => {
    const formTitle = "活动反馈 $& {title}";
    const item = {
      type: "collection_form_submission",
      title: "fallback",
      content: "private answer must not appear",
      meta: JSON.stringify({ formTitle }),
    };
    expect(notificationPresentation(item)).toEqual({
      title: `「${formTitle}」收到新提交`,
      content: "你的表单收到一份新回答，点击查看提交记录。",
    });
    expect(browserNotificationPresentation(item, "en-US")).toEqual({
      title: `New response to “${formTitle}”`,
      body: "Your form received a new response. Open it to view submissions.",
    });
  });
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
  it("localizes credited survey rewards from the original award snapshot", () => {
    const item = {
      type: "collection_form_reward",
      title: "fallback",
      content: "fallback body",
      meta: JSON.stringify({ formTitle: "轻笺调研", points: 20 }),
    };
    expect(notificationPresentation(item)).toEqual({
      title: "「轻笺调研」奖励已到账",
      content: "你提交的「轻笺调研」已获得 20 积分，奖励已到账。",
    });
    expect(browserNotificationPresentation(item, "en-US")).toEqual({
      title: "Reward credited for “轻笺调研”",
      body: "You earned 20 points for submitting “轻笺调研”. The reward is now in your account.",
    });
    expect(notificationPresentation({ ...item, meta: { points: -1 } })).toEqual(
      {
        title: "fallback",
        content: "fallback body",
      },
    );
    const formTitle = "反馈 $& {title} {points}";
    expect(
      notificationPresentation({ ...item, meta: { formTitle, points: 20 } }),
    ).toEqual({
      title: `「${formTitle}」奖励已到账`,
      content: `你提交的「${formTitle}」已获得 20 积分，奖励已到账。`,
    });
  });
});

it("distinguishes existing review, result and conversation notifications", () => {
  for (const [kind, title] of Object.entries({
    review: "有新帖子待审核",
    reply: "有人回复了你",
    mention: "有人在帖子中提及你",
    comment: "你的帖子收到新评论",
    subscription: "你订阅的帖子有新评论",
    result: "社区处理结果",
  })) {
    expect(
      notificationPresentation({
        type: "community_feed",
        title: "旧标题",
        meta: JSON.stringify({ kind }),
      }).title,
    ).toBe(title);
  }
  expect(
    notificationPresentation({
      type: "community_feed",
      title: "保留未知类型",
      meta: { kind: "future" },
    }).title,
  ).toBe("保留未知类型");
  expect(
    notificationPresentation(
      { type: "community_feed", meta: { kind: "review" } },
      "en-US",
    ).title,
  ).toBe("New post awaiting review");
});
