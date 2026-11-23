export const USER_AGENT = 'JobAppAggregator/0.1 (+job feed ingestion)';

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const res = await fetchWithTimeout(url, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } }, timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${url.split('?')[0]} → ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Run `fn` over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}
