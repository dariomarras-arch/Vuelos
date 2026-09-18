import { getReadyRepository } from "@/lib/data/ready";
import { DEMO_USER_ID } from "@/lib/constants";
import { getProviderConfig } from "@/lib/providers";
import { DEFAULT_SCHEDULER_BUCKETS } from "@/lib/scheduler/frequency";
import { AIRPORT_GROUPS } from "@/lib/providers/mockData";
import { NotificationSettingsPanel } from "@/components/settings/NotificationSettingsPanel";
import { isDemoMode } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const repo = await getReadyRepository();
  const searches = await repo.listSearches(DEMO_USER_ID);
  const providerConfig = getProviderConfig();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-base-50">Configuración</h1>
        <p className="text-sm text-base-400">Proveedor de datos, programación automática y notificaciones.</p>
      </div>

      <section className="card card-pad">
        <h2 className="mb-1 section-title">Proveedor de vuelos</h2>
        <p className="mb-3 text-xs text-base-500">
          Se selecciona con la variable de entorno <code className="rounded bg-base-850 px-1">FLIGHT_API_PROVIDER</code>. Cambiarla
          no requiere modificar código — ver <code className="rounded bg-base-850 px-1">src/lib/providers/index.ts</code>.
        </p>
        <div className="flex flex-col gap-2">
          {providerConfig.available.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-base-850 px-3 py-2 text-sm">
              <span className={p.id === providerConfig.activeProvider ? "font-medium text-accent-400" : "text-base-300"}>
                {p.label} {p.id === providerConfig.activeProvider && "· activo"}
              </span>
              <span className={`text-xs ${p.configured ? "text-emerald-400" : "text-base-500"}`}>
                {p.configured ? "Configurado" : "Sin credenciales"}
              </span>
            </div>
          ))}
        </div>
        {isDemoMode() && (
          <p className="mt-3 text-xs text-amber-300/80">
            Persistencia: modo demo en memoria (Supabase no configurado). Ver .env.example para conectar una base real.
          </p>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="mb-1 section-title">Programación automática</h2>
        <p className="mb-3 text-xs text-base-500">
          Frecuencia de búsqueda según la cercanía de la fecha de viaje. Definida en{" "}
          <code className="rounded bg-base-850 px-1">src/lib/scheduler/frequency.ts</code>.
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-base-500">
            <tr>
              <th className="py-1.5 text-left font-medium">Rango</th>
              <th className="py-1.5 text-right font-medium">Búsquedas / día</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_SCHEDULER_BUCKETS.map((b) => (
              <tr key={b.id} className="border-t border-white/5">
                <td className="py-1.5 text-base-300">{b.label}</td>
                <td className="py-1.5 text-right text-base-200">{b.runsPerDay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card card-pad">
        <h2 className="mb-1 section-title">Aeropuertos alternativos</h2>
        <p className="mb-3 text-xs text-base-500">
          Grupos usados cuando &ldquo;Permitir aeropuertos alternativos&rdquo; está activo en una búsqueda. Definidos en{" "}
          <code className="rounded bg-base-850 px-1">src/lib/providers/mockData.ts</code>.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AIRPORT_GROUPS.map((g) => (
            <div key={g.id} className="rounded-lg border border-white/5 bg-base-850 px-3 py-2 text-sm">
              <span className="font-medium text-base-200">{g.label}:</span>{" "}
              <span className="text-base-400">{g.airports.join(", ")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-3 section-title">Notificaciones</h2>
        <NotificationSettingsPanel searches={searches} />
      </section>
    </div>
  );
}
