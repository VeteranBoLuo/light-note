export const notificationMessages = {
  "zh-CN": {
    ranks: {
      1: "蒙童",
      2: "书生",
      3: "秀才",
      4: "举人",
      5: "贡士",
      6: "进士",
      7: "探花",
      8: "榜眼",
      9: "状元",
      10: "翰林",
      11: "学士",
      12: "大学士",
      13: "文豪",
      14: "文宗",
      15: "文圣",
    },
    manor: {
      digestTitle: "庄园有收获在等你",
      waterTitle: "有 {n} 滴任务水即将到期",
      waterContent: "{date} 的任务水滴将在账号时区次日 00:00 重置，请前往庄园领取",
      ripe: "{n} 块地已成熟",
      tankFull: "养鱼舱有产肥位存满了",
      compostFull: "堆肥箱存满了",
      crafted: "工坊鱼饵做好了",
      rewards: "有等级礼物待领取",
    },
    levelUpTitle: "升级到 Lv.{level} · {name}",
    levelGift: "AI 赠礼 {amount} tokens 已到账",
    levelGiftPending: "AI 赠礼待到账",
    opinionReplyTitle: "你的反馈收到新回复",
    emailHealthTitle: "请检查账号邮箱",
    emailHealthContent:
      "账号邮箱 {email} 可能无法接收邮件。请前往账号与安全核对或更换，以便忘记密码时找回账号。正常登录和使用不受影响。",
    collectionRewardTitle: "「{title}」奖励已到账",
    signupSurveyTitle: "你是从哪里发现轻笺的？",
    signupSurveyContent:
      "邀请你分享最初了解轻笺的渠道，帮助我们找到更多有需要的人。首次成功提交可获得 {points} 积分，自动到账，每个账号仅奖励一次。自愿参与，不影响正常使用。",
    collectionRewardContent:
      "你提交的「{title}」已获得 {points} 积分，奖励已到账。",
    collectionSubmissionTitle: "「{title}」收到新提交",
    collectionSubmissionContent: "你的表单收到一份新回答，点击查看提交记录。",
    publicResourceReviewTitle: "有公开资源待审核",
    publicResourceResultTitle: "公开资源审核结果",
    publicResourceBatchTitle: "公开资源批量审核结果",
    publicResourceActions: {
      approve: "审核通过",
      reject: "审核未通过",
      remove: "已下架",
      unlock: "已解除下架",
    },
    publicResourceCount: "{action} {count} 项",
    communityReplyTitle: "社区有新的回复或提及",
    communityResultTitle: "社区处理结果",
    communityTitles: {
      review: "有新帖子待审核",
      reply: "有人回复了你",
      mention: "有人在帖子中提及你",
      comment: "你的帖子收到新评论",
      subscription: "你订阅的帖子有新评论",
    },
  },
  "en-US": {
    ranks: {
      1: "Novice",
      2: "Scholar",
      3: "Licentiate",
      4: "Provincial",
      5: "Tribute",
      6: "Metropolitan",
      7: "3rd Laureate",
      8: "2nd Laureate",
      9: "Top Laureate",
      10: "Academician",
      11: "Bachelor",
      12: "Grand Scholar",
      13: "Literary Master",
      14: "Literary Leader",
      15: "Literary Sage",
    },
    manor: {
      digestTitle: "Your manor has rewards waiting",
      waterTitle: "{n} task water drops expire soon",
      waterContent: "Task water for {date} resets at 00:00 the next day in your account timezone. Collect it in your manor",
      ripe: "{n} plots are ripe",
      tankFull: "A fish tank fertilizer slot is full",
      compostFull: "Compost bin is full",
      crafted: "Workshop bait is ready",
      rewards: "Level gifts are ready to collect",
    },
    levelUpTitle: "Leveled up to Lv.{level} · {name}",
    levelGift: "AI gift of {amount} tokens credited",
    levelGiftPending: "AI gift pending",
    opinionReplyTitle: "Your feedback got a reply",
    emailHealthTitle: "Check your account email",
    emailHealthContent:
      "Your account email {email} may not receive mail. Check or change it in Account & security so you can recover your account if you forget your password. Sign-in and normal use are unaffected.",
    collectionRewardTitle: "Reward credited for “{title}”",
    signupSurveyTitle: "How did you first hear about Light Note?",
    signupSurveyContent:
      "Share where you first heard about Light Note to help us reach more people. Your first successful submission earns {points} points automatically, once per account. Participation is optional.",
    collectionRewardContent:
      "You earned {points} points for submitting “{title}”. The reward is now in your account.",
    collectionSubmissionTitle: "New response to “{title}”",
    collectionSubmissionContent:
      "Your form received a new response. Open it to view submissions.",
    publicResourceReviewTitle: "Public resource awaiting review",
    publicResourceResultTitle: "Public resource review result",
    publicResourceBatchTitle: "Public resource batch review result",
    publicResourceActions: {
      approve: "Approved",
      reject: "Not approved",
      remove: "Removed",
      unlock: "Removal lifted",
    },
    publicResourceCount: "{action}: {count}",
    communityReplyTitle: "New community reply or mention",
    communityResultTitle: "Community review result",
    communityTitles: {
      review: "New post awaiting review",
      reply: "Someone replied to you",
      mention: "Someone mentioned you in a post",
      comment: "New comment on your post",
      subscription: "New comment on a subscribed post",
    },
  },
};
export function formatWeeklyReportExperience(value) {
  const exp = Number.isFinite(value) ? value : 0;
  return exp >= 0 ? `+${exp}` : String(exp);
}

export function notificationPresentation(item, locale = "zh-CN") {
  const messages =
    notificationMessages[locale] || notificationMessages["zh-CN"];
  let meta = item.meta || {};
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  let title = item.title || "轻笺";
  let content = String(item.content || "");
  if (meta?.weeklyReport && typeof meta.weeklyReport === "object") {
    // 历史通知正文已固化；只修正经验前的双重符号，保留原始统计与文案。
    content = content.replace(/\+(-\d+(?:\.\d+)?)(?=\s*(?:经验|EXP))/g, "$1");
  }
  if (
    item.type === "collection_form_submission" &&
    typeof meta?.formTitle === "string"
  ) {
    title = messages.collectionSubmissionTitle.replace(
      "{title}",
      () => meta.formTitle,
    );
    content = messages.collectionSubmissionContent;
  }
  if (
    item.type === "collection_form_reward" &&
    typeof meta?.formTitle === "string" &&
    Number.isSafeInteger(meta.points) &&
    meta.points > 0
  ) {
    title = messages.collectionRewardTitle.replace(
      "{title}",
      () => meta.formTitle,
    );
    content = messages.collectionRewardContent.replace(
      /\{(title|points)\}/g,
      (_match, key) => (key === "title" ? meta.formTitle : String(meta.points)),
    );
  }
  if (item.type === "level_up")
    title = messages.levelUpTitle
      .replace("{level}", String(meta.level || ""))
      .replace("{name}", messages.ranks[meta.level] || meta.name || "");
  if (item.type === "level_up") {
    const amount = Number(meta.aiGiftTokens || 0);
    content = Number.isSafeInteger(amount) && amount > 0
      ? messages.levelGift.replace('{amount}', amount.toLocaleString(locale === 'en-US' ? 'en-US' : 'zh-CN'))
      : ['held', 'missing'].includes(meta.aiGiftStatus) ? messages.levelGiftPending : '';
  }
  if (item.type === "opinion_reply") title = messages.opinionReplyTitle;
  if (["manor_digest", "manor_water_expiring"].includes(item.type) &&
      typeof meta?.manor?.dayKey === "string" &&
      /^\d{8}$/.test(meta?.manor?.dayKey || "") &&
      ["water", "ripe", "tankFull", "rewards"].every(key => Number.isSafeInteger(meta.manor[key]) && meta.manor[key] >= 0) &&
      ["compostFull", "crafted"].every(key => typeof meta.manor[key] === "boolean")) {
    const manor = meta.manor, copy = messages.manor;
    const date = `${manor.dayKey.slice(0, 4)}-${manor.dayKey.slice(4, 6)}-${manor.dayKey.slice(6)}`;
    const reasons = [
      manor.ripe ? copy.ripe.replace("{n}", String(manor.ripe)) : "",
      manor.tankFull ? copy.tankFull : "",
      manor.compostFull ? copy.compostFull : "",
      manor.crafted ? copy.crafted : "",
      manor.rewards ? copy.rewards : "",
    ].filter(Boolean);
    const water = item.type === "manor_water_expiring";
    title = water ? copy.waterTitle.replace("{n}", String(manor.water)) : copy.digestTitle;
    content = [water ? copy.waterContent.replace("{date}", date) : date, ...reasons].join(" · ");
  }
  if (
    item.type === "signup_source_survey" &&
    Number.isSafeInteger(meta.points) &&
    meta.points > 0
  ) {
    title = messages.signupSurveyTitle;
    content = messages.signupSurveyContent.replace(
      "{points}",
      String(meta.points),
    );
  }
  if (item.type === "email_health") {
    title = messages.emailHealthTitle;
    content = messages.emailHealthContent.replace("{email}", () =>
      String(meta.maskedEmail || ""),
    );
  }
  if (item.type === "public_resource") {
    title =
      meta.kind === "review"
        ? messages.publicResourceReviewTitle
        : messages.publicResourceResultTitle;
    if (
      meta.kind === "result" &&
      meta.counts &&
      typeof meta.counts === "object"
    ) {
      title = messages.publicResourceBatchTitle;
      content = Object.entries(messages.publicResourceActions)
        .filter(
          ([action]) =>
            Number.isSafeInteger(meta.counts[action]) &&
            meta.counts[action] > 0,
        )
        .map(([action, label]) =>
          messages.publicResourceCount
            .replace("{action}", label)
            .replace("{count}", String(meta.counts[action])),
        )
        .join(" · ");
    } else if (
      meta.kind === "result" &&
      Object.hasOwn(messages.publicResourceActions, meta.action)
    ) {
      content = [
        meta.resourceTitle,
        messages.publicResourceActions[meta.action],
        meta.reason,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
  if (item.type === "community_feed")
    title =
      meta.kind === "result"
        ? messages.communityResultTitle
        : Object.hasOwn(messages.communityTitles, meta.kind)
          ? messages.communityTitles[meta.kind]
          : title;
  return {
    title,
    content,
  };
}
export function browserNotificationPresentation(item, locale) {
  const value = notificationPresentation(item, locale);
  const plain = (text, max) =>
    [
      ...String(text)
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ]
      .slice(0, max)
      .join("");
  return { title: plain(value.title, 120), body: plain(value.content, 240) };
}
