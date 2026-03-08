export async function waitForHttp(
  url: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 100;
  const startedAt = Date.now();

  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Retry until timeout.
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${url}`);
    }

    await Bun.sleep(intervalMs);
  }
}

export function getTestPort(): number {
  return 3200 + Math.floor(Math.random() * 2000);
}
