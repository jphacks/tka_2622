type PerformanceFields = Record<string, string | number | boolean | undefined>;

export function isServerPerformanceLoggingEnabled(): boolean {
  return process.env.PERFORMANCE_LOGS_ENABLED === "true";
}

export function logServerPerformance(
  event: string,
  fields: PerformanceFields = {},
): void {
  if (!isServerPerformanceLoggingEnabled()) return;

  console.info(
    JSON.stringify({
      type: "server_performance",
      event,
      vercel_region: process.env.VERCEL_REGION ?? "unknown",
      ...fields,
    }),
  );
}

export async function measureServerOperation<T>(
  event: string,
  operation: () => Promise<T>,
  fields: PerformanceFields = {},
): Promise<T> {
  if (!isServerPerformanceLoggingEnabled()) return operation();

  const startedAt = performance.now();
  let status: "resolved" | "threw" = "resolved";
  try {
    return await operation();
  } catch (error) {
    status = "threw";
    throw error;
  } finally {
    logServerPerformance(event, {
      ...fields,
      duration_ms: Number((performance.now() - startedAt).toFixed(1)),
      status,
    });
  }
}
