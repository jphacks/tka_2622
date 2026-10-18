import { listDisposalMunicipalities } from "../../../../server/disposal/collection-schedule";
import { DisposalMunicipalityListResponseSchema } from "../../../../types/disposal";

export async function GET(): Promise<Response> {
  return Response.json(
    DisposalMunicipalityListResponseSchema.parse({
      municipalities: listDisposalMunicipalities(),
    }),
  );
}
