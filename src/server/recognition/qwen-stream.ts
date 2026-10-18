/**
 * Reads an OpenAI-compatible chat completion stream (server-sent events) and
 * reports the accumulated message text after every content delta.
 */
export async function readChatCompletionStream(
  response: Response,
  onText: (text: string) => void,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    const delta =
      typeof chunk === "object" &&
      chunk !== null &&
      "choices" in chunk &&
      Array.isArray(chunk.choices)
        ? (chunk.choices[0] as { delta?: { content?: unknown } } | undefined)
            ?.delta?.content
        : undefined;
    if (typeof delta === "string" && delta) {
      text += delta;
      onText(text);
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
  return text;
}
