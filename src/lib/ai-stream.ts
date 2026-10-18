/**
 * Streaming protocol for AI routes. A client that sends
 * `Accept: application/x-ndjson` receives one JSON event per line:
 *
 *   {"type":"partial","data":{...}}   — the AI output received so far
 *   {"type":"result","status":200,"body":{...}} — the route's normal response
 *
 * Clients that do not ask for a stream get the plain JSON response unchanged.
 */
export const AI_STREAM_CONTENT_TYPE = "application/x-ndjson";

export type AiStreamEvent =
  | { type: "partial"; data: unknown }
  | { type: "result"; status: number; body: unknown };

export function wantsAiStream(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes(AI_STREAM_CONTENT_TYPE);
}

const PARTIAL_INTERVAL_MS = 80;

export function streamAiResponse(
  run: (emitPartial: (data: unknown) => void) => Promise<Response>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: AiStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let lastSent = "";
      let lastSentAt = 0;
      const emitPartial = (data: unknown) => {
        const serialized = JSON.stringify(data);
        const now = Date.now();
        if (serialized === lastSent || now - lastSentAt < PARTIAL_INTERVAL_MS) {
          return;
        }
        lastSent = serialized;
        lastSentAt = now;
        write({ type: "partial", data });
      };

      try {
        const response = await run(emitPartial);
        const body: unknown = await response.json().catch(() => null);
        write({ type: "result", status: response.status, body });
      } catch (error) {
        console.error("AI stream failed.", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        write({
          type: "result",
          status: 500,
          body: {
            error: {
              code: "AI_STREAM_FAILED",
              message: "AIの処理を完了できませんでした。もう一度お試しください。",
            },
          },
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `${AI_STREAM_CONTENT_TYPE}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Reads a response from an AI route. Streams report partial output through
 * `onPartial`; either way the route's final status and JSON body are returned.
 */
export async function readAiResponse(
  response: Response,
  onPartial: (data: unknown) => void,
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(AI_STREAM_CONTENT_TYPE) || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body };
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: { status: number; ok: boolean; body: unknown } | null = null;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: AiStreamEvent;
    try {
      event = JSON.parse(line) as AiStreamEvent;
    } catch {
      return;
    }
    if (event.type === "partial") onPartial(event.data);
    else if (event.type === "result") {
      result = {
        status: event.status,
        ok: event.status >= 200 && event.status < 300,
        body: event.body,
      };
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handleLine(buffer);
  return (
    result ?? {
      status: 502,
      ok: false,
      body: {
        error: {
          code: "AI_STREAM_INCOMPLETE",
          message: "AIの応答が途中で途切れました。もう一度お試しください。",
        },
      },
    }
  );
}
