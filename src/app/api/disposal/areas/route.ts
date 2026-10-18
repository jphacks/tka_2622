import {
  findDisposalMunicipality,
  listDisposalAreas,
} from "../../../../server/disposal/collection-schedule";
import {
  DisposalAreaListResponseSchema,
  MunicipalityCodeSchema,
} from "../../../../types/disposal";

export async function GET(request: Request): Promise<Response> {
  const code = MunicipalityCodeSchema.safeParse(
    new URL(request.url).searchParams.get("municipality"),
  );
  const municipality = code.success ? findDisposalMunicipality(code.data) : null;
  if (!municipality) {
    return Response.json(
      {
        error: {
          code: "INVALID_MUNICIPALITY",
          message: "区市町村の一覧から選択してください。",
        },
      },
      { status: 400 },
    );
  }

  return Response.json(
    DisposalAreaListResponseSchema.parse({
      municipality,
      areas: (await listDisposalAreas(municipality.code)) ?? [],
    }),
  );
}
