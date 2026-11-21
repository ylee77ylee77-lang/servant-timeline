/**
 * In-memory, bounded and per-mounted-session conversation snapshots.
 * No persistent browser storage or shared cache is used for private messages.
 */
export function createConversationCache<T>(maxEntries = 6) {
  const entries = new Map<string, T[]>();
  return {
    has(peerId: string): boolean {
      return entries.has(peerId);
    },
    get(peerId: string): T[] | undefined {
      const saved = entries.get(peerId);
      return saved ? [...saved] : undefined;
    },
    set(peerId: string, rows: T[]): void {
      entries.delete(peerId);
      entries.set(peerId, [...rows]);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (!oldest) break;
        entries.delete(oldest);
      }
    },
    clear(): void {
      entries.clear();
    },
  };
}
