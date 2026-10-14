/**
 * Execute independent project reads with bounded concurrency while keeping their
 * original order. A rejected fetch fails the whole aggregate (never partial KPIs).
 */
export async function mapWithConcurrency<T, U>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Límite de concurrencia inválido");
  const results = new Array<U>(values.length);
  let nextIndex = 0;
  let failed = false;
  async function run(): Promise<void> {
    while (!failed && nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = await worker(values[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(values.length, limit) }, () => run()));
  return results;
}
