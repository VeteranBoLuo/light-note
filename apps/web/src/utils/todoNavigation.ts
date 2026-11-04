/** A badge click is an explicit request to see the tasks counted by that badge. */
export function todoNavigationTarget(attentionTotal: number) {
  return {
    path: '/inbox',
    query: { tab: 'todo', ...(attentionTotal > 0 ? { attention: '1' } : {}) },
  };
}
