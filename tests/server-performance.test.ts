import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isServerPerformanceLoggingEnabled,
  logServerPerformance,
  measureServerOperation,
} from "../src/lib/server-performance";

describe("server performance logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("is disabled unless explicitly enabled", () => {
    vi.stubEnv("PERFORMANCE_LOGS_ENABLED", "false");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    expect(isServerPerformanceLoggingEnabled()).toBe(false);
    logServerPerformance("items.test");
    expect(log).not.toHaveBeenCalled();
  });

  it("writes structured timing records when enabled", async () => {
    vi.stubEnv("PERFORMANCE_LOGS_ENABLED", "true");
    vi.stubEnv("VERCEL_REGION", "test-region");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      measureServerOperation("items.test.query", async () => "result", {
        request_id: "test-request-id",
      }),
    ).resolves.toBe("result");

    const record = JSON.parse(String(log.mock.calls[0][0]));
    expect(record).toMatchObject({
      type: "server_performance",
      event: "items.test.query",
      request_id: "test-request-id",
      vercel_region: "test-region",
      status: "resolved",
    });
    expect(record.duration_ms).toEqual(expect.any(Number));
  });

  it("logs failed operations and preserves their errors", async () => {
    vi.stubEnv("PERFORMANCE_LOGS_ENABLED", "true");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("operation failed");

    await expect(
      measureServerOperation("items.test.failure", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      event: "items.test.failure",
      status: "threw",
    });
  });
});
