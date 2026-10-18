import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { updateProxySession } = vi.hoisted(() => ({
  updateProxySession: vi.fn(),
}));

vi.mock("../src/lib/supabase/update-proxy-session", () => ({
  updateProxySession,
}));

vi.mock("../src/lib/server-performance", () => ({
  isServerPerformanceLoggingEnabled: () => false,
  measureServerOperation: (
    _name: string,
    operation: () => unknown,
  ) => operation(),
}));

import { proxy } from "../proxy";

describe("proxy handling invalid Supabase refresh tokens", () => {
  beforeEach(() => {
    updateProxySession.mockResolvedValue({
      response: NextResponse.next(),
      claims: null,
      error: {
        name: "AuthApiError",
        code: "refresh_token_not_found",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects protected pages to login instead of rendering a server error", async () => {
    const response = await proxy(
      new NextRequest("https://monosaki.example/items/item-1"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://monosaki.example/login?next=%2Fitems%2Fitem-1",
    );
  });

  it("returns an unauthenticated response for protected APIs", async () => {
    const response = await proxy(
      new NextRequest("https://monosaki.example/api/items/item-1"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
