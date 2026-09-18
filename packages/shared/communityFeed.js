export const COMMUNITY_FEED_LIMITS = Object.freeze({
  resources: 3,
  images: 9,
  imageBytes: 5 * 1024 * 1024,
  title: 80,
  body: 4000,
  comment: 1200,
  topics: 1,
  interests: 3,
  mentions: 10,
  pageSize: 20,
  maxPageSize: 50,
});
export const COMMUNITY_POST_KINDS = Object.freeze([
  "share",
  "question",
  "thought",
]);
export const COMMUNITY_PROFILE_CONSENT_VERSION = 1;
export const communityTextLength = (value) =>
  Array.from(String(value || "")).length;
export function normalizeCommunityPost(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !COMMUNITY_POST_KINDS.includes(input.kind)
  )
    throw new Error("COMMUNITY_INVALID_INPUT");
  if (input.title !== undefined && typeof input.title !== "string")
    throw new Error("COMMUNITY_INVALID_INPUT");
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body =
    typeof input.body === "string"
      ? input.body.replace(/\r\n?/g, "\n").trim()
      : "";
  if (
    !body ||
    communityTextLength(body) > COMMUNITY_FEED_LIMITS.body ||
    communityTextLength(title) > COMMUNITY_FEED_LIMITS.title ||
    (input.kind === "question" && !title) ||
    (input.kind === "thought" && title)
  )
    throw new Error("COMMUNITY_INVALID_INPUT");
  const images = input.images ?? [];
  if (
    !Array.isArray(images) ||
    images.length > COMMUNITY_FEED_LIMITS.images ||
    new Set(
      images.map((id) => (typeof id === "string" ? id.toLowerCase() : id)),
    ).size !== images.length ||
    images.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    throw new Error("COMMUNITY_INVALID_INPUT");
  const resources = input.resources ?? [];
  if (
    !Array.isArray(resources) ||
    resources.length > 3 ||
    new Set(resources.map((id) => String(id).toLowerCase())).size !==
      resources.length ||
    resources.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    throw new Error("COMMUNITY_INVALID_INPUT");
  const topics = input.topics ?? [],
    mentions = input.mentions ?? [];
  if (
    !Array.isArray(topics) ||
    topics.length > COMMUNITY_FEED_LIMITS.topics ||
    topics.some((x) => typeof x !== "string" || !/^[a-z0-9-]{1,40}$/.test(x)) ||
    !Array.isArray(mentions) ||
    mentions.length > 10 ||
    mentions.some((x) => typeof x !== "string" || !/^[0-9a-f-]{36}$/i.test(x))
  )
    throw new Error("COMMUNITY_INVALID_INPUT");
  return {
    ...(images.length ? { images: images.map((id) => id.toLowerCase()) } : {}),
    ...(resources.length
      ? { resources: resources.map((id) => id.toLowerCase()) }
      : {}),
    kind: input.kind,
    title,
    body,
    topics: [...new Set(topics)].sort(),
    mentions: [...new Set(mentions)].sort(),
  };
}
