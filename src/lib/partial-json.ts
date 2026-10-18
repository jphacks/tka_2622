interface ScanState {
  inString: boolean;
  escaped: boolean;
  closers: string[];
  /** Offsets of `,`, `{` and `[` outside strings, in order. */
  boundaries: number[];
}

function scan(text: string): ScanState {
  const state: ScanState = {
    inString: false,
    escaped: false,
    closers: [],
    boundaries: [],
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (state.inString) {
      if (state.escaped) state.escaped = false;
      else if (char === "\\") state.escaped = true;
      else if (char === '"') state.inString = false;
      continue;
    }
    if (char === '"') state.inString = true;
    else if (char === "{") {
      state.closers.push("}");
      state.boundaries.push(index);
    } else if (char === "[") {
      state.closers.push("]");
      state.boundaries.push(index);
    } else if (char === "}" || char === "]") state.closers.pop();
    else if (char === ",") state.boundaries.push(index);
  }
  return state;
}

function closeAndParse(text: string): { ok: true; value: unknown } | { ok: false } {
  const state = scan(text);
  let repaired = text;
  if (state.inString) {
    if (state.escaped) repaired = repaired.slice(0, -1);
    repaired += '"';
  }
  repaired = repaired.replace(/[\s,]+$/, "");
  repaired += [...state.closers].reverse().join("");
  try {
    return { ok: true, value: JSON.parse(repaired) };
  } catch {
    return { ok: false };
  }
}

/**
 * Parses the JSON object an LLM is still writing. Unfinished strings are
 * closed and incomplete keys or values are dropped, so the result holds every
 * field received so far. Returns undefined until an object has started.
 */
export function parsePartialJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  const source = text.slice(start);

  const whole = closeAndParse(source);
  if (whole.ok) return whole.value;

  const { boundaries } = scan(source);
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const offset = boundaries[index];
    const cut =
      source[offset] === "," ? source.slice(0, offset) : source.slice(0, offset + 1);
    const candidate = closeAndParse(cut);
    if (candidate.ok) return candidate.value;
  }
  return undefined;
}
