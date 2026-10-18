import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../src/app/api/items/plan/route";
import { requireApiUser } from "../src/lib/supabase/server";

vi.mock("../src/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function configureDelete(
  result: { data: unknown; error: { code: string } | null },
) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase: { rpc },
    user: { id: "user-1" },
  } as never);
  return rpc;
}

describe("DELETE /api/items/plan", () => {
  it("deletes only the authenticated user's saved plan", async () => {
    const rpc = configureDelete({
      data: { deleted: true, inProgress: false },
      error: null,
    });

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(rpc).toHaveBeenCalledWith("delete_user_move_plan_generation");
  });

  it("rejects deletion while plan generation is in progress", async () => {
    configureDelete({
      data: { deleted: false, inProgress: true },
      error: null,
    });

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("MOVE_PLAN_GENERATION_IN_PROGRESS");
  });

  it("requires the deletion migration when its RPC is unavailable", async () => {
    configureDelete({ data: null, error: { code: "PGRST202" } });

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("MOVE_PLAN_MIGRATION_REQUIRED");
  });

  it("does not call the deletion RPC for unauthenticated requests", async () => {
    const response = Response.json({ error: "unauthenticated" }, { status: 401 });
    vi.mocked(requireApiUser).mockResolvedValue({
      response,
    } as never);

    await expect(DELETE()).resolves.toBe(response);
  });
});
