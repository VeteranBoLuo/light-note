export const notificationMessages: Record<
  string,
  {
    ranks: Record<string, string>;
    levelUpTitle: string;
    opinionReplyTitle: string;
    collectionRewardTitle: string;
    collectionRewardContent: string;
    collectionSubmissionTitle: string;
    collectionSubmissionContent: string;
  }
>;
export function formatWeeklyReportExperience(value: number): string;
export function notificationPresentation(
  item: { type?: string; title?: string; content?: string | null; meta?: any },
  locale?: string,
): { title: string; content: string };
export function browserNotificationPresentation(
  item: { type?: string; title?: string; content?: string | null; meta?: any },
  locale?: string,
): { title: string; body: string };
