// Presentation only: requests still revalidate capability and all write permissions.
const known = new Map<string, { enabled: boolean; at: number }>();
export function knownCommunityLayout(owner: string): boolean {
  const value = known.get(owner);
  return Boolean(value?.enabled && Date.now() - value.at < 300_000);
}
export function rememberCommunityLayout(owner: string, enabled: boolean) {
  known.delete(owner);
  known.set(owner, { enabled, at: Date.now() });
  while (known.size > 8) known.delete(known.keys().next().value!);
}
