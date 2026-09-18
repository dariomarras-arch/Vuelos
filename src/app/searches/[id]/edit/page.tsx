import { notFound } from "next/navigation";
import { getReadyRepository } from "@/lib/data/ready";
import { SearchForm } from "@/components/searches/SearchForm";

export const dynamic = "force-dynamic";

export default async function EditSearchPage({ params }: { params: { id: string } }) {
  const repo = await getReadyRepository();
  const search = await repo.getSearch(params.id);
  if (!search) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-base-50">Editar búsqueda</h1>
        <p className="text-sm text-base-400">{search.name}</p>
      </div>
      <SearchForm existing={search} />
    </div>
  );
}
