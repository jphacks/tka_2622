import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/analyze/route";

const validResponse = {
  item: {
    name: "木製デスク",
    category: "furniture",
    condition: {
      grade: 3,
      observations: ["天板に細かな傷が見られる"],
      needsUserConfirmation: false,
    },
  },
  recommendation: {
    action: "sell",
    reason: "外観上は再利用できる可能性があります。",
  },
};

function createRequest(
  image: Blob,
  filename = "item.png",
): Request {
  const formData = new FormData();
  formData.append("image", image, filename);
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: formData,
  });
}

function configureQwen() {
  process.env.DASHSCOPE_API_KEY = "test-key";
  process.env.QWEN_VISION_MODEL = "qwen-vl-test";
  process.env.QWEN_BASE_URL = "https://example.test/v1";
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_VISION_MODEL;
  delete process.env.QWEN_BASE_URL;
});

describe("POST /api/analyze", () => {
  it("validates a supported image and returns the schema-checked result", async () => {
    configureQwen();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest(new Blob(["image"], { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(validResponse);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects unsupported image types without calling Qwen", async () => {
    configureQwen();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest(new Blob(["image"], { type: "image/gif" })),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_IMAGE" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects images larger than 5 MB without calling Qwen", async () => {
    configureQwen();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      createRequest(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
        type: "image/png",
      })),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "IMAGE_TOO_LARGE" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a configuration error when Qwen credentials are absent", async () => {
    const response = await POST(
      createRequest(new Blob(["image"], { type: "image/jpeg" })),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "SERVER_CONFIG_ERROR" },
    });
  });

  it("logs only the upstream status when Qwen rejects a request", async () => {
    configureQwen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      createRequest(new Blob(["image"], { type: "image/jpeg" })),
    );

    expect(response.status).toBe(502);
    expect(errorSpy).toHaveBeenCalledWith("Qwen Vision request failed", {
      status: 401,
    });
  });

  it("rejects malformed model JSON instead of forwarding it", async () => {
    configureQwen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: '{"recommendation":{"action":"recycle"}}' } }],
        }),
      ),
    );

    const response = await POST(
      createRequest(new Blob(["image"], { type: "image/jpeg" })),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: { code: "AI_RESPONSE_INVALID" },
    });
  });
});
