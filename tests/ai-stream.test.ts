import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_STREAM_CONTENT_TYPE,
  readAiResponse,
  streamAiResponse,
  wantsAiStream,
} from "../src/lib/ai-stream";
import { parsePartialJson } from "../src/lib/partial-json";
import { generateMovePlanText } from "../src/server/recognition/qwen-text-client";
import { readChatCompletionStream } from "../src/server/recognition/qwen-stream";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function sseEvents(deltas: string[]): string {
  return (
    deltas
      .map(
        (content) =>
          `data: ${JSON.stringify({ choices: [{ delta: { content }, index: 0 }] })}\n\n`,
      )
      .join("") + "data: [DONE]\n\n"
  );
}

describe("parsePartialJson", () => {
  it.each([
    ["", undefined],
    ['{"item":{"na', { item: {} }],
    ['{"item":{"name":"木製デ', { item: { name: "木製デ" } }],
    ['{"item":{"name":"木製デスク","category":', { item: { name: "木製デスク" } }],
    ['{"tasks":[{"taskTitle":"梱包"},{"task', { tasks: [{ taskTitle: "梱包" }, {}] }],
    ['{"a":"line\\', { a: "line" }],
    ['{"grade":4,"ok":tru', { grade: 4 }],
    ['{"a":1}', { a: 1 }],
  ])("parses %j", (input, expected) => {
    expect(parsePartialJson(input)).toEqual(expected);
  });
});

describe("readChatCompletionStream", () => {
  it("accumulates content deltas even when events are split across chunks", async () => {
    const body = sseEvents(['{"item":', '{"name":"本"}', "}"]);
    const response = sseResponse([body.slice(0, 37), body.slice(37, 90), body.slice(90)]);
    const seen: string[] = [];

    const text = await readChatCompletionStream(response, (current) => seen.push(current));

    expect(text).toBe('{"item":{"name":"本"}}');
    expect(seen).toEqual(['{"item":', '{"item":{"name":"本"}', '{"item":{"name":"本"}}']);
  });
});

describe("generateMovePlanText streaming", () => {
  it("streams partial plans and returns the complete JSON", async () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubEnv("QWEN_BASE_URL", "https://example.test/v1");
    vi.stubEnv("QWEN_TEXT_MODEL", "qwen3.7-flash");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([sseEvents(['{"summary":"準備', 'します","tasks":[]}'])]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const partials: unknown[] = [];

    const plan = await generateMovePlanText('{"items":[]}', (partial) =>
      partials.push(partial),
    );

    expect(plan).toEqual({ summary: "準備します", tasks: [] });
    expect(partials[0]).toEqual({ summary: "準備" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({ stream: true });
  });
});

describe("AI stream protocol", () => {
  it("detects stream requests by the Accept header", () => {
    expect(
      wantsAiStream(
        new Request("http://localhost", {
          headers: { Accept: AI_STREAM_CONTENT_TYPE },
        }),
      ),
    ).toBe(true);
    expect(wantsAiStream(new Request("http://localhost"))).toBe(false);
  });

  it("sends partial output followed by the route's normal result", async () => {
    const response = streamAiResponse(async (emitPartial) => {
      emitPartial({ item: { name: "本" } });
      return Response.json({ error: { code: "AI_TIMEOUT" } }, { status: 504 });
    });
    const partials: unknown[] = [];

    const result = await readAiResponse(response, (data) => partials.push(data));

    expect(partials).toEqual([{ item: { name: "本" } }]);
    expect(result).toEqual({
      status: 504,
      ok: false,
      body: { error: { code: "AI_TIMEOUT" } },
    });
  });

  it("reads a plain JSON response unchanged", async () => {
    const result = await readAiResponse(
      Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
      () => {
        throw new Error("no partials expected");
      },
    );
    expect(result).toEqual({
      status: 401,
      ok: false,
      body: { error: { code: "UNAUTHORIZED" } },
    });
  });

  it("reports a stream that ends without a result", async () => {
    const result = await readAiResponse(
      new Response('{"type":"partial","data":{}}\n', {
        headers: { "Content-Type": AI_STREAM_CONTENT_TYPE },
      }),
      () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
  });
});
