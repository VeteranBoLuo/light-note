import { describe, expect, it } from "vitest";
import {
  notificationPresentation,
  browserNotificationPresentation,
  formatWeeklyReportExperience,
} from "./notificationPresentation.js";
describe("shared notification presentation", () => {
  it("summarizes batch review results and gives individual results a readable outcome", () => {
    const item = {
      type: "public_resource",
      meta: { kind: "result", counts: { approve: 12, reject: 2 } },
    };
    expect(notificationPresentation(item, "zh-CN")).toEqual({
      title: "公开资源批量审核结果",
      content: "审核通过 12 项 · 审核未通过 2 项",
    });
    expect(
      notificationPresentation(
        { ...item, meta: JSON.stringify(item.meta) },
        "en-US",
      ),
    ).toEqual({
      title: "Public resource batch review result",
      content: "Approved: 12 · Not approved: 2",
    });
    expect(
      notificationPresentation(
        {
          type: "public_resource",
          meta: {
            kind: "result",
            action: "reject",
            resourceTitle: "示例",
            reason: "请核对来源",
          },
        },
        "zh-CN",
      ).content,
    ).toBe("示例 · 审核未通过 · 请核对来源");
    expect(
      notificationPresentation(
        { type: "public_resource", title: "旧通知" },
        "zh-CN",
      ),
    ).toEqual({ title: "公开资源审核结果", content: "" });
  });
  it.each([[10, "+10"], [0, "+0"], [-9283, "-9283"]])(
    "formats weekly experience %s with one sign",
    (value, expected) => {
      expect(formatWeeklyReportExperience(value)).toBe(expected);
    },
  );
  it.each(["本周 +-9283 经验 · 签到 1 天", "Last week +-9283 EXP · 1 check-in days"])(
    "fixes double signs in historical weekly notifications: %s",
    (content) => {
      const item = { type: "system", content, meta: JSON.stringify({ weeklyReport: { exp: -9283 } }) };
      expect(notificationPresentation(item).content).toBe(content.replace("+-9283", "-9283"));
      expect(browserNotificationPresentation(item).body).toBe(content.replace("+-9283", "-9283"));
      expect(notificationPresentation({ ...item, meta: null }).content).toBe(content);
    },
  );
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

it("public-resource notices contain only localized metadata and never submission text",()=>{
  expect(notificationPresentation({type:"public_resource",meta:{kind:"review"}}).title).toBe("有公开资源待审核");
  expect(notificationPresentation({type:"public_resource",meta:{kind:"result"}},"en-US").title).toBe("Public resource review result");
});

it('邮箱健康提醒按用户语言展示脱敏地址及找回说明', () => {
  const item = { type: 'email_health', title: 'stored fallback', content: 'stored fallback', meta: { maskedEmail: 'n***@example.com' } };
  const zh = notificationPresentation(item, 'zh-CN');
  const en = notificationPresentation(item, 'en-US');
  expect(zh.title).toBe('请检查账号邮箱');
  expect(zh.content).toContain('n***@example.com');
  expect(zh.content).toContain('正常登录和使用不受影响');
  expect(en.title).toBe('Check your account email');
  expect(en.content).toContain('n***@example.com');
  expect(en.content).not.toContain('stored fallback');
});

it("来源调查邀请按语言显示发出时的奖励，不显示名额限制", () => {
  const notice = { type: "signup_source_survey", meta: { points: 50 } };
  expect(notificationPresentation(notice, "zh-CN")).toMatchObject({
    title: "你是从哪里发现轻笺的？",
  });
  expect(notificationPresentation(notice, "zh-CN").content).toContain(
    "50 积分",
  );
  expect(notificationPresentation(notice, "en-US").content).toContain(
    "50 points",
  );
});
