const TTL_MS = 15 * 60 * 1000;

const store = new Map<string, { value: unknown; expiresAt: number }>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown): void {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function cacheBust(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
