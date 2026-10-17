import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMovePlanText } from "../src/server/recognition/qwen-text-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("generateMovePlanText", () => {
  it("requests non-thinking JSON output from the configured model", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubEnv("QWEN_BASE_URL", "https://example.test/compatible-mode/v1/");
    vi.stubEnv("QWEN_TEXT_MODEL", "qwen3.7-flash");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"準備します","tasks":[]}' } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateMovePlanText('{"items":[]}');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://example.test/compatible-mode/v1/chat/completions",
    );
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "qwen3.7-flash",
      response_format: { type: "json_object" },
      enable_thinking: false,
    });
  });
});
