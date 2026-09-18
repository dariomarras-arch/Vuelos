import { SearchForm } from "@/components/searches/SearchForm";

export default function NewSearchPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-base-50">Crear búsqueda</h1>
        <p className="text-sm text-base-400">
          Definí origen, destinos y todos los parámetros que el motor usará para analizar combinaciones de fechas, horarios y
          precios.
        </p>
      </div>
      <SearchForm />
    </div>
  );
}
