/** Seasonal topics share covers between the topic header and official entry. */
const covers: Record<string, string> = {
  'mid-autumn': '/brand-scenes/community-midautumn.webp',
  'national-day': '/brand-scenes/community-national-day.webp',
};
export const communityTopicCover = (slug: string) => covers[slug] || '';
