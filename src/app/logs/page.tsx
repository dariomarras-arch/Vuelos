import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { dateTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function LogsPage({ searchParams }: { searchParams: { searchId?: string } }) {
  const repo = await getReadyRepository();
  const runs = await repo.listSearchRuns(searchParams.searchId, 100);
  const searches = await repo.listSearches(DEMO_USER_ID);
  const searchMap = new Map(searches.map((s) => [s.id, s]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-base-50">Historial de ejecuciones</h1>
        <p className="text-sm text-base-400">Registro de cada corrida del motor de búsqueda, exitosa o con error.</p>
      </div>

      {runs.length === 0 ? (
        <div className="card card-pad text-sm text-base-400">Todavía no hay ejecuciones registradas.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((r) => {
            const search = searchMap.get(r.searchId);
            return (
              <div key={r.id} className="card card-pad font-mono text-xs">
                {r.status === "error" ? (
                  <div className="text-red-400">
                    {dateTime(r.startedAt)} · {search ? `${search.origins.join("/")} → ${search.destinations.join("/")}` : r.searchId}
                    <br />
                    🔴 Error: {r.errorMessage}
                  </div>
                ) : (
                  <div className="text-base-300">
                    <div className="mb-1 text-base-100">
                      {dateTime(r.startedAt)} · {search ? `${search.origins.join("/")} → ${search.destinations.join("/")}` : r.searchId}
                    </div>
                    <div className="text-base-400">
                      {r.combinationsAnalyzed} combinaciones analizadas · {r.flightsFound} vuelos encontrados ·{" "}
                      {r.opportunitiesFound} oportunidades · {r.alertsSent} alerta{r.alertsSent === 1 ? "" : "s"} enviada
                      {r.alertsSent === 1 ? "" : "s"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
