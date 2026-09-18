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
    levelUpTitle: "升级到 Lv.{level} · {name}",
    opinionReplyTitle: "你的反馈收到新回复",
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
    levelUpTitle: "Leveled up to Lv.{level} · {name}",
    opinionReplyTitle: "Your feedback got a reply",
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
  if (item.type === "level_up")
    title = messages.levelUpTitle
      .replace("{level}", String(meta.level || ""))
      .replace("{name}", messages.ranks[meta.level] || meta.name || "");
  if (item.type === "opinion_reply") title = messages.opinionReplyTitle;
  if (item.type === "community_feed")
    title =
      meta.kind === "result"
        ? messages.communityResultTitle
        : Object.hasOwn(messages.communityTitles, meta.kind)
          ? messages.communityTitles[meta.kind]
          : title;
  return {
    title,
    content: item.type === "level_up" ? "" : String(item.content || ""),
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
