import { notFound } from "next/navigation";
import { getReadyRepository } from "@/lib/data/ready";
import { SearchSubnav } from "@/components/searches/SearchSubnav";
import { FlightComparator } from "@/components/searches/FlightComparator";

export const dynamic = "force-dynamic";

export default async function ComparePage({ params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(params.id);
  if (!search) notFound();

  const flights = await repo.latestFlightResults(search.id);
  const sorted = [...flights].sort((a, b) => a.price.effectivePrice - b.price.effectivePrice).slice(0, 12);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <SearchSubnav searchId={search.id} searchName={search.name} active="compare" />

      <div>
        <h1 className="text-xl font-bold text-base-50">Comparador de vuelos</h1>
        <p className="text-sm text-base-400">
          Comparación objetiva de las diferencias entre vuelos — el sistema no elige un ganador automáticamente.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="card card-pad text-sm text-base-400">Todavía no hay resultados para comparar. Ejecutá la búsqueda primero.</div>
      ) : (
        <FlightComparator flights={sorted} />
      )}
    </div>
  );
}
